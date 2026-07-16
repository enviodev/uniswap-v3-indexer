import { describe, it, expect } from "vitest";
import { BigDecimal } from "envio";
import {
  updateUniswapDayData,
  updatePoolDayData,
  updatePoolHourData,
  updateTokenDayData,
  updateTokenHourData,
} from "../src/handlers/utils/intervalUpdates";
import {
  CHAIN_ID,
  POOL_ID,
  WETH_ID,
  TIMESTAMP,
  makeFactory,
  makeBundle,
  makePool,
  makeToken,
  makeMockContext,
} from "./helpers";

const bd = (v: string | number) => new BigDecimal(v.toString());

const DAY_ID = Math.floor(TIMESTAMP / 86400);
const HOUR_ID = Math.floor(TIMESTAMP / 3600);

describe("updateUniswapDayData", () => {
  it("creates the day entity with chain-scoped id and factory aggregates", async () => {
    const factory = makeFactory({
      txCount: 42n,
      totalValueLockedUSD: bd("1234.5"),
    });
    const context = makeMockContext({});
    const dayData = await updateUniswapDayData(
      TIMESTAMP,
      CHAIN_ID,
      factory,
      context
    );

    expect(dayData.id).toBe(`${CHAIN_ID}-${DAY_ID}`);
    expect(dayData.date).toBe(DAY_ID * 86400);
    expect(dayData.txCount).toBe(42n);
    expect(dayData.tvlUSD.toString()).toBe("1234.5");
    expect(dayData.volumeUSD.isZero()).toBe(true);
  });

  it("keeps accumulated volume on subsequent updates in the same day", async () => {
    const factory = makeFactory({ txCount: 1n });
    const context = makeMockContext({
      UniswapDayData: [
        {
          id: `${CHAIN_ID}-${DAY_ID}`,
          date: DAY_ID * 86400,
          volumeETH: bd("7"),
          volumeUSD: bd("14000"),
          volumeUSDUntracked: bd(0),
          feesUSD: bd("42"),
          tvlUSD: bd(0),
          txCount: 0n,
        },
      ],
    });
    const dayData = await updateUniswapDayData(
      TIMESTAMP + 60,
      CHAIN_ID,
      factory,
      context
    );
    expect(dayData.volumeUSD.toString()).toBe("14000");
    expect(dayData.feesUSD.toString()).toBe("42");
    expect(dayData.txCount).toBe(1n);
  });
});

describe("updatePoolDayData / updatePoolHourData OHLC", () => {
  it("sets open to the pool price at bucket creation (regression: token intervals used to open at 0)", async () => {
    const pool = makePool({ token0Price: bd("3700"), token1Price: bd("0.00027") });
    const context = makeMockContext({});
    const dayData = await updatePoolDayData(TIMESTAMP, pool, context);

    expect(dayData.id).toBe(`${POOL_ID}-${DAY_ID}`);
    expect(dayData.open.toString()).toBe("3700");
    expect(dayData.high.toString()).toBe("3700");
    expect(dayData.low.toString()).toBe("3700");
    expect(dayData.close.toString()).toBe("3700");
    expect(dayData.txCount).toBe(1n);
  });

  it("tracks high/low/close across updates while open stays fixed", async () => {
    const context = makeMockContext({});
    await updatePoolDayData(
      TIMESTAMP,
      makePool({ token0Price: bd("3700") }),
      context
    );
    await updatePoolDayData(
      TIMESTAMP + 60,
      makePool({ token0Price: bd("3900") }),
      context
    );
    const dayData = await updatePoolDayData(
      TIMESTAMP + 120,
      makePool({ token0Price: bd("3600") }),
      context
    );

    expect(dayData.open.toString()).toBe("3700");
    expect(dayData.high.toString()).toBe("3900");
    expect(dayData.low.toString()).toBe("3600");
    expect(dayData.close.toString()).toBe("3600");
    expect(dayData.txCount).toBe(3n);
  });

  it("hour data uses periodStartUnix buckets", async () => {
    const pool = makePool({ token0Price: bd("3700") });
    const context = makeMockContext({});
    const hourData = await updatePoolHourData(TIMESTAMP, pool, context);
    expect(hourData.id).toBe(`${POOL_ID}-${HOUR_ID}`);
    expect(hourData.periodStartUnix).toBe(HOUR_ID * 3600);
    expect(hourData.open.toString()).toBe("3700");
  });

  it("snapshots liquidity, prices, tick and tvl from the pool", async () => {
    const pool = makePool({
      liquidity: 123n,
      sqrtPrice: 456n,
      token0Price: bd("1"),
      token1Price: bd("1"),
      tick: 60n,
      totalValueLockedUSD: bd("99"),
    });
    const context = makeMockContext({});
    const dayData = await updatePoolDayData(TIMESTAMP, pool, context);
    expect(dayData.liquidity).toBe(123n);
    expect(dayData.sqrtPrice).toBe(456n);
    expect(dayData.tick).toBe(60n);
    expect(dayData.tvlUSD.toString()).toBe("99");
  });
});

describe("updateTokenDayData / updateTokenHourData OHLC", () => {
  const bundle = makeBundle(bd("2000"));

  it("opens at the current derived USD price (regression: used to open at 0)", async () => {
    const token = makeToken(WETH_ID, "WETH", "Wrapped Ether", 18n, {
      derivedETH: bd("1"),
      totalValueLocked: bd("10"),
      totalValueLockedUSD: bd("20000"),
    });
    const context = makeMockContext({});
    const dayData = await updateTokenDayData(TIMESTAMP, token, bundle, context);

    expect(dayData.id).toBe(`${WETH_ID}-${DAY_ID}`);
    expect(dayData.open.toString()).toBe("2000");
    expect(dayData.high.toString()).toBe("2000");
    expect(dayData.low.toString()).toBe("2000");
    expect(dayData.close.toString()).toBe("2000");
    expect(dayData.priceUSD.toString()).toBe("2000");
    expect(dayData.totalValueLocked.toString()).toBe("10");
    expect(dayData.totalValueLockedUSD.toString()).toBe("20000");
  });

  it("updates high/low/close as the derived price moves", async () => {
    const context = makeMockContext({});
    const tokenAt = (derivedETH: string) =>
      makeToken(WETH_ID, "WETH", "Wrapped Ether", 18n, {
        derivedETH: bd(derivedETH),
      });

    await updateTokenDayData(TIMESTAMP, tokenAt("1"), bundle, context);
    await updateTokenDayData(TIMESTAMP + 60, tokenAt("1.2"), bundle, context);
    const dayData = await updateTokenDayData(
      TIMESTAMP + 120,
      tokenAt("0.9"),
      bundle,
      context
    );

    expect(dayData.open.toString()).toBe("2000");
    expect(dayData.high.toString()).toBe("2400");
    expect(dayData.low.toString()).toBe("1800");
    expect(dayData.close.toString()).toBe("1800");
  });

  it("hour data mirrors day data at hour granularity", async () => {
    const token = makeToken(WETH_ID, "WETH", "Wrapped Ether", 18n, {
      derivedETH: bd("1"),
    });
    const context = makeMockContext({});
    const hourData = await updateTokenHourData(TIMESTAMP, token, bundle, context);
    expect(hourData.id).toBe(`${WETH_ID}-${HOUR_ID}`);
    expect(hourData.periodStartUnix).toBe(HOUR_ID * 3600);
    expect(hourData.open.toString()).toBe("2000");
    expect(hourData.priceUSD.toString()).toBe("2000");
  });
});
