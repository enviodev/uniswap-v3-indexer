import { describe, it, expect } from "vitest";
import { BigDecimal } from "envio";
import {
  sqrtPriceX96ToTokenPrices,
  getNativePriceInUSD,
  getTrackedAmountUSD,
  findNativePerToken,
  MAX_PRICING_POOL_VALUE_IMBALANCE,
} from "../src/handlers/utils/pricing";
import {
  CHAIN_ID,
  USDC,
  WETH,
  USDC_ID,
  WETH_ID,
  POOL_ID,
  USDC_WETH_03_POOL,
  makeToken,
  makePool,
  makeBundle,
  makeMockContext,
  SWAP_FIXTURE,
} from "./helpers";

const bd = (v: string | number) => new BigDecimal(v.toString());

const usdc = () => makeToken(USDC_ID, "USDC", "USD Coin", 6n);
const weth = () => makeToken(WETH_ID, "WETH", "Wrapped Ether", 18n);

describe("sqrtPriceX96ToTokenPrices", () => {
  it("converts a real USDC/WETH sqrtPrice to token prices", () => {
    const [price0, price1] = sqrtPriceX96ToTokenPrices(
      SWAP_FIXTURE.sqrtPriceX96,
      usdc(),
      weth()
    );

    // At this mainnet swap ETH traded around $3,732 (price0 = USDC per WETH)
    expect(price0.toFixed(6)).toBe("3732.531944");
    expect(price1.toFixed(12)).toBe("0.000267914653");
  });

  it("keeps full precision for micro prices (regression: used to round price1 to 4dp)", () => {
    // A pool whose token1 price is far below 1e-4 must not collapse to zero
    const sqrtPrice = 79228162514264337593543n; // ~1e-12 ratio on equal decimals
    const t0 = makeToken(`${CHAIN_ID}-0x01`, "A", "A", 18n);
    const t1 = makeToken(`${CHAIN_ID}-0x02`, "B", "B", 18n);
    const [price0, price1] = sqrtPriceX96ToTokenPrices(sqrtPrice, t0, t1);
    expect(price1.isZero()).toBe(false);
    expect(price1.lt(bd("1e-4"))).toBe(true);
    expect(price0.isZero()).toBe(false);
  });

  it("returns [0, 0] for zero sqrtPrice", () => {
    const [price0, price1] = sqrtPriceX96ToTokenPrices(0n, usdc(), weth());
    expect(price0.isZero()).toBe(true);
    expect(price1.isZero()).toBe(true);
  });
});

describe("getNativePriceInUSD", () => {
  const stablePoolWithPrices = (token0IsNative: boolean) =>
    makePool({
      token0_id: token0IsNative ? WETH_ID : USDC_ID,
      token1_id: token0IsNative ? USDC_ID : WETH_ID,
      token0Price: bd("3700"),
      token1Price: bd("0.00027"),
    });

  it("returns token0Price when the stablecoin is token0 (mainnet orientation)", async () => {
    const context = makeMockContext({ Pool: [stablePoolWithPrices(false)] });
    const price = await getNativePriceInUSD(
      context,
      CHAIN_ID,
      USDC_WETH_03_POOL,
      WETH
    );
    expect(price.toString()).toBe("3700");
  });

  it("returns token1Price when the wrapped native is token0", async () => {
    const context = makeMockContext({ Pool: [stablePoolWithPrices(true)] });
    const price = await getNativePriceInUSD(
      context,
      CHAIN_ID,
      USDC_WETH_03_POOL,
      WETH
    );
    expect(price.toString()).toBe("0.00027");
  });

  it("returns 0 when the stable pool does not exist yet", async () => {
    const context = makeMockContext({});
    const price = await getNativePriceInUSD(
      context,
      CHAIN_ID,
      USDC_WETH_03_POOL,
      WETH
    );
    expect(price.isZero()).toBe(true);
  });

  it("returns 1 when the reference token is itself a stablecoin (Arc convention)", async () => {
    const context = makeMockContext({});
    const price = await getNativePriceInUSD(context, CHAIN_ID, USDC, USDC);
    expect(price.toString()).toBe("1");
  });
});

describe("getTrackedAmountUSD", () => {
  const bundle = makeBundle(bd("2000"));
  const whitelist = [USDC, WETH];

  it("sums both sides when both tokens are whitelisted", () => {
    const t0 = { ...usdc(), derivedETH: bd("0.0005") };
    const t1 = { ...weth(), derivedETH: bd("1") };
    const tracked = getTrackedAmountUSD(
      bundle,
      bd("1000"), // 1000 USDC = $1000
      t0 as any,
      bd("1"), // 1 WETH = $2000
      t1 as any,
      whitelist
    );
    expect(tracked.toString()).toBe("3000");
  });

  it("doubles the whitelisted side when only one token is whitelisted", () => {
    const t0 = { ...usdc(), derivedETH: bd("0.0005") };
    const junk = makeToken(`${CHAIN_ID}-0x03`, "JUNK", "Junk", 18n, {
      derivedETH: bd("42"),
    });
    const tracked = getTrackedAmountUSD(
      bundle,
      bd("1000"),
      t0 as any,
      bd("999999"),
      junk as any,
      whitelist
    );
    expect(tracked.toString()).toBe("2000");
  });

  it("returns 0 when neither token is whitelisted", () => {
    const junk0 = makeToken(`${CHAIN_ID}-0x03`, "J0", "J0", 18n, {
      derivedETH: bd("1"),
    });
    const junk1 = makeToken(`${CHAIN_ID}-0x04`, "J1", "J1", 18n, {
      derivedETH: bd("1"),
    });
    const tracked = getTrackedAmountUSD(
      bundle,
      bd("5"),
      junk0 as any,
      bd("5"),
      junk1 as any,
      whitelist
    );
    expect(tracked.isZero()).toBe(true);
  });
});

/**
 * findNativePerToken + the imbalance guard, ported from the v4 indexer's
 * pricingGuards suite (fixtures replicate real attacks observed on the v4
 * production indexer). A pool may only set a token's derivedETH when the
 * value it implies for the token side is ≤ 1000× the pool's verifiable
 * (whitelisted) side.
 */
describe("findNativePerToken", () => {
  const ETH_PRICE_USD = bd(2000);
  const MIN_NATIVE_LOCKED = bd(1);
  const STABLECOINS = [USDC];
  const bundle = makeBundle(ETH_PRICE_USD);

  const wethToken = () => ({ ...weth(), derivedETH: bd(1) });

  function makeWhitelistPool(
    id: string,
    opts: {
      token0: string;
      token1: string;
      tvl0: BigDecimal;
      tvl1: BigDecimal;
      token0Price: BigDecimal;
      liquidity?: bigint;
    }
  ) {
    return makePool({
      id,
      token0_id: `${CHAIN_ID}-${opts.token0}`,
      token1_id: `${CHAIN_ID}-${opts.token1}`,
      totalValueLockedToken0: opts.tvl0,
      totalValueLockedToken1: opts.tvl1,
      token0Price: opts.token0Price,
      token1Price: bd(0),
      liquidity: opts.liquidity ?? 1n,
    });
  }

  const priceFor = (context: any, token: any) =>
    findNativePerToken(
      context,
      token,
      bundle,
      WETH,
      STABLECOINS,
      MIN_NATIVE_LOCKED
    );

  it("prices the wrapped native token at 1", async () => {
    const context = makeMockContext({});
    const price = await priceFor(context, wethToken());
    expect(price.toString()).toBe("1");
  });

  it("prices stablecoins at 1/ethPriceUSD", async () => {
    const context = makeMockContext({});
    const price = await priceFor(context, usdc());
    expect(price.toString()).toBe("0.0005");
  });

  it("prices a token from its deepest whitelist pool", async () => {
    const pepe = makeToken(
      `${CHAIN_ID}-0x6982508145454ce325ddbe47a25d4ec3d2311933`,
      "PEPE",
      "Pepe",
      18n,
      { whitelistPools: ["pepe-pool"], isWhitelisted: false }
    );
    const pool = makeWhitelistPool("pepe-pool", {
      token0: WETH,
      token1: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
      tvl0: bd("500"),
      tvl1: bd("85000000000"),
      token0Price: bd("5.88e-9"),
    });
    const context = makeMockContext({
      Pool: [pool],
      Token: [wethToken()],
    });
    const price = await priceFor(context, pepe);
    expect(price.toString()).toBe("5.88e-9");
  });

  it("ignores pools with zero liquidity", async () => {
    const token = makeToken(`${CHAIN_ID}-0x05`, "T", "T", 18n, {
      whitelistPools: ["empty-pool"],
      isWhitelisted: false,
    });
    const pool = makeWhitelistPool("empty-pool", {
      token0: WETH,
      token1: "0x05",
      tvl0: bd("100"),
      tvl1: bd("100"),
      token0Price: bd("1"),
      liquidity: 0n,
    });
    const context = makeMockContext({ Pool: [pool], Token: [wethToken()] });
    const price = await priceFor(context, token);
    expect(price.isZero()).toBe(true);
  });

  it("still enforces minimumNativeLocked on balanced pools", async () => {
    const token = makeToken(`${CHAIN_ID}-0x06`, "T", "T", 18n, {
      whitelistPools: ["tiny-pool"],
      isWhitelisted: false,
    });
    const pool = makeWhitelistPool("tiny-pool", {
      token0: WETH,
      token1: "0x06",
      tvl0: bd("0.5"), // below the 1 ETH minimum
      tvl1: bd("0.5"),
      token0Price: bd("1"),
    });
    const context = makeMockContext({ Pool: [pool], Token: [wethToken()] });
    const price = await priceFor(context, token);
    expect(price.isZero()).toBe(true);
  });

  describe("imbalance guard (deliberate deviation from the subgraph)", () => {
    it("rejects poison-and-park: tiny real capital against an absurd price", async () => {
      const being = makeToken(
        `${CHAIN_ID}-0xbbbe40e7ae6e22aad49d6a7c9389ef25714be179`,
        "being",
        "being",
        18n,
        { whitelistPools: ["poison-pool"], isWhitelisted: false }
      );
      const usdcToken = { ...usdc(), derivedETH: bd("0.0005") };
      const pool = makeWhitelistPool("poison-pool", {
        token0: USDC,
        token1: "0xbbbe40e7ae6e22aad49d6a7c9389ef25714be179",
        tvl0: bd("4388.723262"),
        tvl1: bd("200000000"),
        token0Price: bd("2.5e19"),
      });
      const context = makeMockContext({
        Pool: [pool],
        Token: [usdcToken, wethToken()],
      });
      const price = await priceFor(context, being);
      expect(price.isZero()).toBe(true);
    });

    it("rejects honest-price fake-balance: parity price, free-minted supply", async () => {
      const oneXEth = makeToken(
        `${CHAIN_ID}-0x41d91195960719e3c0077a9dd1716a050708b9b1`,
        "1xETH",
        "1xETH",
        18n,
        { whitelistPools: ["surgical-pool"], isWhitelisted: false }
      );
      const pool = makeWhitelistPool("surgical-pool", {
        token0: WETH,
        token1: "0x41d91195960719e3c0077a9dd1716a050708b9b1",
        tvl0: bd("1.01"),
        tvl1: bd("1300000000"),
        token0Price: bd(1),
      });
      const context = makeMockContext({ Pool: [pool], Token: [wethToken()] });
      const price = await priceFor(context, oneXEth);
      expect(price.isZero()).toBe(true);
    });

    it("trap pool with larger ethLocked loses to a balanced legit pool", async () => {
      const agEth = makeToken(
        `${CHAIN_ID}-0xe1b4d34e8754600962cd944b535180bd758e6c2e`,
        "agETH",
        "agETH",
        18n,
        { whitelistPools: ["trap-pool", "legit-pool"], isWhitelisted: false }
      );
      const trap = makeWhitelistPool("trap-pool", {
        token0: WETH,
        token1: "0xe1b4d34e8754600962cd944b535180bd758e6c2e",
        tvl0: bd("55"),
        tvl1: bd("30"),
        token0Price: bd("11173"),
      });
      const legit = makeWhitelistPool("legit-pool", {
        token0: WETH,
        token1: "0xe1b4d34e8754600962cd944b535180bd758e6c2e",
        tvl0: bd("50"),
        tvl1: bd("49"),
        token0Price: bd("1.02"),
      });
      const context = makeMockContext({
        Pool: [trap, legit],
        Token: [wethToken()],
      });
      const price = await priceFor(context, agEth);
      expect(price.toString()).toBe("1.02");
    });

    it("accepts exactly at the imbalance bound (lte, not lt)", async () => {
      const token = makeToken(`${CHAIN_ID}-0x07`, "T", "T", 18n, {
        whitelistPools: ["edge-pool"],
        isWhitelisted: false,
      });
      const pool = makeWhitelistPool("edge-pool", {
        token0: WETH,
        token1: "0x07",
        tvl0: bd("10"),
        tvl1: bd("10000"),
        token0Price: bd("1"), // implied = 10000 = 1000 × 10
      });
      const context = makeMockContext({ Pool: [pool], Token: [wethToken()] });
      const price = await priceFor(context, token);
      expect(price.toString()).toBe("1");
      expect(MAX_PRICING_POOL_VALUE_IMBALANCE.toString()).toBe("1000");
    });

    it("accepts a legitimately lopsided launch pool (~500x)", async () => {
      const launch = makeToken(`${CHAIN_ID}-0x08`, "T", "T", 18n, {
        whitelistPools: ["launch-pool"],
        isWhitelisted: false,
      });
      const pool = makeWhitelistPool("launch-pool", {
        token0: WETH,
        token1: "0x08",
        tvl0: bd("2"),
        tvl1: bd("900000000"),
        token0Price: bd("1.1e-6"), // implied ≈ 990 ETH ≈ 495 × ethLocked
      });
      const context = makeMockContext({ Pool: [pool], Token: [wethToken()] });
      const price = await priceFor(context, launch);
      expect(price.toString()).toBe("0.0000011");
    });
  });
});
