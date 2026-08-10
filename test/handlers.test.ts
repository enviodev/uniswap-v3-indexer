/**
 * Handler lifecycle tests using createTestIndexer() with simulated events —
 * no network access. Entities are preset directly (skipping PoolCreated's
 * token-metadata effect), then Initialize → Mint → Swap → Burn → Collect are
 * replayed through the real handlers and the entity math is asserted,
 * including the subgraph-parity regressions (upper-tick liquidityNet sign on
 * burn, bootstrap pricing flow, transaction entities).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { BigDecimal, createTestIndexer, type TestIndexer } from "envio";
import {
  CHAIN_ID,
  USDC,
  WETH,
  FACTORY_ID,
  BUNDLE_ID,
  POOL_ID,
  USDC_ID,
  WETH_ID,
  USDC_WETH_03_POOL,
  TIMESTAMP,
  BLOCK_NUMBER,
  TX_HASH,
  TX_FROM,
  GAS_PRICE,
  makeFactory,
  makeBundle,
  makePool,
  makeToken,
  SWAP_FIXTURE,
} from "./helpers";
import { ZERO_BD } from "../src/handlers/utils/constants";

const bd = (v: string | number) => new BigDecimal(v.toString());

// Position minted around the fixture's current tick (194071)
const TICK_LOWER = 190000n;
const TICK_UPPER = 200000n;
const MINT_LIQUIDITY = 5000000000000000000n;
const MINT_AMOUNT0 = 200000000000n; // 200,000 USDC
const MINT_AMOUNT1 = 60000000000000000000n; // 60 WETH

const tx = { hash: TX_HASH, gasPrice: GAS_PRICE, from: TX_FROM };

/**
 * Preset factory/bundle/tokens, then run a real PoolCreated event through the
 * factory handler. Because the tokens already exist, the token-metadata
 * effect never fires (fully offline), and the contractRegister hook registers
 * the pool address so subsequent simulated pool events are routed.
 */
async function presetEntities(indexer: TestIndexer) {
  indexer.Factory.set(makeFactory({ poolCount: 0n }));
  indexer.Bundle.set(makeBundle());
  indexer.Token.set(
    makeToken(USDC_ID, "USDC", "USD Coin", 6n, { whitelistPools: [] })
  );
  indexer.Token.set(
    makeToken(WETH_ID, "WETH", "Wrapped Ether", 18n, { whitelistPools: [] })
  );
  await indexer.process({
    chains: {
      [CHAIN_ID]: {
        simulate: [
          {
            contract: "UniswapV3Factory",
            event: "PoolCreated",
            block: { number: BLOCK_NUMBER - 1, timestamp: TIMESTAMP - 12 },
            params: {
              token0: USDC,
              token1: WETH,
              fee: 3000n,
              tickSpacing: 60n,
              pool: USDC_WETH_03_POOL,
            },
          },
        ],
      },
    },
  });
}

async function processInitialize(indexer: TestIndexer, blockOffset = 0) {
  return indexer.process({
    chains: {
      [CHAIN_ID]: {
        simulate: [
          {
            contract: "UniswapV3Pool",
            event: "Initialize",
            srcAddress: USDC_WETH_03_POOL,
            block: {
              number: BLOCK_NUMBER + blockOffset,
              timestamp: TIMESTAMP + blockOffset * 12,
            },
            params: {
              sqrtPriceX96: SWAP_FIXTURE.sqrtPriceX96,
              tick: SWAP_FIXTURE.tick,
            },
          },
        ],
      },
    },
  });
}

async function processMint(indexer: TestIndexer, blockOffset = 1) {
  return indexer.process({
    chains: {
      [CHAIN_ID]: {
        simulate: [
          {
            contract: "UniswapV3Pool",
            event: "Mint",
            srcAddress: USDC_WETH_03_POOL,
            block: {
              number: BLOCK_NUMBER + blockOffset,
              timestamp: TIMESTAMP + blockOffset * 12,
            },
            transaction: tx,
            params: {
              sender: TX_FROM,
              owner: TX_FROM,
              tickLower: TICK_LOWER,
              tickUpper: TICK_UPPER,
              amount: MINT_LIQUIDITY,
              amount0: MINT_AMOUNT0,
              amount1: MINT_AMOUNT1,
            },
          },
        ],
      },
    },
  });
}

async function processSwap(indexer: TestIndexer, blockOffset = 2) {
  return indexer.process({
    chains: {
      [CHAIN_ID]: {
        simulate: [
          {
            contract: "UniswapV3Pool",
            event: "Swap",
            srcAddress: USDC_WETH_03_POOL,
            block: {
              number: BLOCK_NUMBER + blockOffset,
              timestamp: TIMESTAMP + blockOffset * 12,
            },
            transaction: tx,
            params: {
              sender: SWAP_FIXTURE.sender,
              recipient: SWAP_FIXTURE.recipient,
              amount0: SWAP_FIXTURE.amount0,
              amount1: SWAP_FIXTURE.amount1,
              sqrtPriceX96: SWAP_FIXTURE.sqrtPriceX96,
              liquidity: SWAP_FIXTURE.liquidity,
              tick: SWAP_FIXTURE.tick,
            },
          },
        ],
      },
    },
  });
}

describe("Initialize handler", () => {
  let indexer: TestIndexer;
  beforeEach(async () => {
    indexer = createTestIndexer();
    await presetEntities(indexer);
  });

  it("sets sqrtPrice and tick; leaves prices to the first swap (subgraph parity)", async () => {
    await processInitialize(indexer);

    const pool = await indexer.Pool.getOrThrow(POOL_ID);
    expect(pool.sqrtPrice).toBe(SWAP_FIXTURE.sqrtPriceX96);
    expect(pool.tick).toBe(SWAP_FIXTURE.tick);
    // handleInitialize does NOT recompute pool prices — they stay 0 until a swap
    expect(pool.token0Price.isZero()).toBe(true);

    // stable pool has no prices yet → bundle stays 0, USDC derivedETH 0,
    // WETH derivedETH 1 (wrapped native fast path)
    const bundle = await indexer.Bundle.getOrThrow(BUNDLE_ID);
    expect(bundle.ethPriceUSD.isZero()).toBe(true);
    const wethToken = await indexer.Token.getOrThrow(WETH_ID);
    expect(wethToken.derivedETH.toString()).toBe("1");
    const usdcToken = await indexer.Token.getOrThrow(USDC_ID);
    expect(usdcToken.derivedETH.isZero()).toBe(true);
  });
});

describe("Mint handler", () => {
  let indexer: TestIndexer;
  beforeEach(async () => {
    indexer = createTestIndexer();
    await presetEntities(indexer);
    await processInitialize(indexer);
  });

  it("updates liquidity, TVL, ticks and creates Mint + Transaction entities", async () => {
    await processMint(indexer);

    const pool = await indexer.Pool.getOrThrow(POOL_ID);
    // position straddles the current tick → active liquidity increases
    expect(pool.liquidity).toBe(MINT_LIQUIDITY);
    expect(pool.totalValueLockedToken0.toString()).toBe("200000");
    expect(pool.totalValueLockedToken1.toString()).toBe("60");
    expect(pool.txCount).toBe(1n);

    const lowerTick = await indexer.Tick.getOrThrow(
      `${POOL_ID}#${TICK_LOWER}`
    );
    const upperTick = await indexer.Tick.getOrThrow(
      `${POOL_ID}#${TICK_UPPER}`
    );
    expect(lowerTick.liquidityGross).toBe(MINT_LIQUIDITY);
    expect(lowerTick.liquidityNet).toBe(MINT_LIQUIDITY);
    expect(upperTick.liquidityGross).toBe(MINT_LIQUIDITY);
    expect(upperTick.liquidityNet).toBe(-MINT_LIQUIDITY);
    // tick prices: 1.0001^tickIdx
    expect(lowerTick.price0.gt(bd("1"))).toBe(true);
    expect(lowerTick.price1.lt(bd("1"))).toBe(true);

    const mint = await indexer.Mint.getOrThrow(`${TX_HASH}-0`);
    expect(mint.owner).toBe(TX_FROM);
    expect(mint.origin).toBe(TX_FROM);
    expect(mint.amount).toBe(MINT_LIQUIDITY);
    expect(mint.amount0.toString()).toBe("200000");
    expect(mint.amount1.toString()).toBe("60");

    const transaction = await indexer.Transaction.getOrThrow(TX_HASH);
    expect(transaction.gasPrice).toBe(GAS_PRICE);
    expect(transaction.gasUsed).toBe(0n); // subgraph parity: receipt not read

    const factory = await indexer.Factory.getOrThrow(FACTORY_ID);
    expect(factory.txCount).toBe(1n);
  });

  it("does not add active liquidity when the position excludes the current tick", async () => {
    await indexer.process({
      chains: {
        [CHAIN_ID]: {
          simulate: [
            {
              contract: "UniswapV3Pool",
              event: "Mint",
              srcAddress: USDC_WETH_03_POOL,
              block: { number: BLOCK_NUMBER + 1, timestamp: TIMESTAMP + 12 },
              transaction: tx,
              params: {
                sender: TX_FROM,
                owner: TX_FROM,
                tickLower: 100000n, // far below current tick 194071
                tickUpper: 110000n,
                amount: MINT_LIQUIDITY,
                amount0: MINT_AMOUNT0,
                amount1: 0n,
              },
            },
          ],
        },
      },
    });

    const pool = await indexer.Pool.getOrThrow(POOL_ID);
    expect(pool.liquidity).toBe(0n);
    expect(pool.totalValueLockedToken0.toString()).toBe("200000");
  });
});

describe("Swap handler", () => {
  let indexer: TestIndexer;
  beforeEach(async () => {
    indexer = createTestIndexer();
    await presetEntities(indexer);
    await processInitialize(indexer);
    await processMint(indexer);
  });

  it("prices the pool, bundle and tokens from the stablecoin/native pool", async () => {
    await processSwap(indexer);

    const pool = await indexer.Pool.getOrThrow(POOL_ID);
    expect(pool.token0Price.toFixed(6)).toBe("3732.531944");
    expect(pool.token1Price.toFixed(12)).toBe("0.000267914653");
    expect(pool.liquidity).toBe(SWAP_FIXTURE.liquidity);
    expect(pool.tick).toBe(SWAP_FIXTURE.tick);

    // Bundle price comes from this very pool (mainnet stable pool),
    // orientation resolved dynamically: USDC is token0 → token0Price
    const bundle = await indexer.Bundle.getOrThrow(BUNDLE_ID);
    expect(bundle.ethPriceUSD.toFixed(6)).toBe("3732.531944");

    const wethToken = await indexer.Token.getOrThrow(WETH_ID);
    expect(wethToken.derivedETH.toString()).toBe("1");
    const usdcToken = await indexer.Token.getOrThrow(USDC_ID);
    // stablecoin fast path: 1 / ethPriceUSD
    expect(usdcToken.derivedETH.toFixed(12)).toBe(
      bd(1).div(bundle.ethPriceUSD).toFixed(12)
    );
  });

  it("tracks token amounts, TVL and swap entity fields", async () => {
    await processSwap(indexer);

    const pool = await indexer.Pool.getOrThrow(POOL_ID);
    // 200,000 - 77,505.140556 USDC out
    expect(pool.totalValueLockedToken0.toString()).toBe("122494.859444");
    // 60 + 20.824112… WETH in
    expect(pool.totalValueLockedToken1.toString()).toBe(
      "80.82411214820009662"
    );
    expect(pool.volumeToken0.toString()).toBe("77505.140556");
    expect(pool.volumeToken1.toString()).toBe("20.82411214820009662");

    const swap = await indexer.Swap.getOrThrow(`${TX_HASH}-0`);
    expect(swap.sender).toBe(SWAP_FIXTURE.sender);
    expect(swap.recipient).toBe(SWAP_FIXTURE.recipient);
    expect(swap.origin).toBe(TX_FROM);
    expect(swap.amount0.toString()).toBe("-77505.140556");
    expect(swap.amount1.toString()).toBe("20.82411214820009662");
    expect(swap.tick).toBe(SWAP_FIXTURE.tick);

    // First swap happens before derivedETH is known → zero tracked USD
    // (bootstrap behavior, identical in the subgraph)
    expect(swap.amountUSD.isZero()).toBe(true);
  });

  it("accumulates USD volume once prices are established", async () => {
    await processSwap(indexer);

    // second swap: 1 WETH in, ~3732.53 USDC out at the fixture price
    await indexer.process({
      chains: {
        [CHAIN_ID]: {
          simulate: [
            {
              contract: "UniswapV3Pool",
              event: "Swap",
              srcAddress: USDC_WETH_03_POOL,
              block: { number: BLOCK_NUMBER + 3, timestamp: TIMESTAMP + 36 },
              transaction: tx,
              logIndex: 1, // same tx hash as the first swap — avoid id collision
              params: {
                sender: SWAP_FIXTURE.sender,
                recipient: SWAP_FIXTURE.recipient,
                amount0: -3732531944n, // 3,732.531944 USDC out
                amount1: 1000000000000000000n, // 1 WETH in
                sqrtPriceX96: SWAP_FIXTURE.sqrtPriceX96,
                liquidity: SWAP_FIXTURE.liquidity,
                tick: SWAP_FIXTURE.tick,
              },
            },
          ],
        },
      },
    });

    const swap = await indexer.Swap.getOrThrow(`${TX_HASH}-1`);
    // both sides whitelisted → tracked = (usd0 + usd1) / 2 ≈ $3,732.53
    expect(swap.amountUSD.toFixed(2)).toBe("3732.53");

    const factory = await indexer.Factory.getOrThrow(FACTORY_ID);
    expect(factory.totalVolumeUSD.toFixed(2)).toBe("3732.53");
    expect(factory.numberOfSwaps).toBe(2n);

    const pool = await indexer.Pool.getOrThrow(POOL_ID);
    // fees = tracked volume × 0.3%
    expect(pool.feesUSD.toFixed(4)).toBe(
      swap.amountUSD.times(bd("0.003")).toFixed(4)
    );

    // --- DISABLED: day/hour interval aggregates are switched off in the
    // handlers for the slim sync. Uncomment together with them.
//     // interval data captured the volume
//     const dayID = Math.floor((TIMESTAMP + 36) / 86400);
//     const poolDayData = await indexer.PoolDayData.getOrThrow(
//       `${POOL_ID}-${dayID}`
//     );
//     expect(poolDayData.volumeUSD.toFixed(2)).toBe("3732.53");
//     // the day bucket was opened by the mint, before the pool had a price —
//     // open records the price at bucket creation (subgraph parity), close
//     // tracks the latest price
//     expect(poolDayData.open.isZero()).toBe(true);
//     expect(poolDayData.close.toFixed(6)).toBe("3732.531944");

//     const uniswapDayData = await indexer.UniswapDayData.getOrThrow(
//       `${CHAIN_ID}-${dayID}`
//     );
//     expect(uniswapDayData.volumeUSD.toFixed(2)).toBe("3732.53");
  });
});

describe("Burn handler", () => {
  let indexer: TestIndexer;
  beforeEach(async () => {
    indexer = createTestIndexer();
    await presetEntities(indexer);
    await processInitialize(indexer);
    await processMint(indexer);
  });

  it("reverses mint effects on ticks (regression: upper liquidityNet must INCREASE on burn)", async () => {
    const burnAmount = 2000000000000000000n;
    await indexer.process({
      chains: {
        [CHAIN_ID]: {
          simulate: [
            {
              contract: "UniswapV3Pool",
              event: "Burn",
              srcAddress: USDC_WETH_03_POOL,
              block: { number: BLOCK_NUMBER + 3, timestamp: TIMESTAMP + 36 },
              transaction: tx,
              params: {
                owner: TX_FROM,
                tickLower: TICK_LOWER,
                tickUpper: TICK_UPPER,
                amount: burnAmount,
                amount0: 50000000000n, // 50,000 USDC
                amount1: 15000000000000000000n, // 15 WETH
              },
            },
          ],
        },
      },
    });

    const lowerTick = await indexer.Tick.getOrThrow(`${POOL_ID}#${TICK_LOWER}`);
    const upperTick = await indexer.Tick.getOrThrow(`${POOL_ID}#${TICK_UPPER}`);
    expect(lowerTick.liquidityGross).toBe(MINT_LIQUIDITY - burnAmount);
    expect(lowerTick.liquidityNet).toBe(MINT_LIQUIDITY - burnAmount);
    expect(upperTick.liquidityGross).toBe(MINT_LIQUIDITY - burnAmount);
    // mirror of mint: net on the upper tick moves back toward zero
    expect(upperTick.liquidityNet).toBe(-(MINT_LIQUIDITY - burnAmount));

    const pool = await indexer.Pool.getOrThrow(POOL_ID);
    // position includes current tick → active liquidity decreases
    expect(pool.liquidity).toBe(MINT_LIQUIDITY - burnAmount);
    // Burn does NOT reduce TVL (tokens leave on Collect) — subgraph parity
    expect(pool.totalValueLockedToken0.toString()).toBe("200000");

    const burn = await indexer.Burn.getOrThrow(`${TX_HASH}-0`);
    expect(burn.owner).toBe(TX_FROM);
    expect(burn.amount).toBe(burnAmount);
    expect(burn.amount0.toString()).toBe("50000");
  });
});

describe("Collect handler", () => {
  let indexer: TestIndexer;
  beforeEach(async () => {
    indexer = createTestIndexer();
    await presetEntities(indexer);
    await processInitialize(indexer);
    await processMint(indexer);
  });

  it("moves collected amounts out of TVL and into collected fees", async () => {
    await indexer.process({
      chains: {
        [CHAIN_ID]: {
          simulate: [
            {
              contract: "UniswapV3Pool",
              event: "Collect",
              srcAddress: USDC_WETH_03_POOL,
              block: { number: BLOCK_NUMBER + 3, timestamp: TIMESTAMP + 36 },
              transaction: tx,
              params: {
                owner: TX_FROM,
                recipient: TX_FROM,
                tickLower: TICK_LOWER,
                tickUpper: TICK_UPPER,
                amount0: 1000000000n, // 1,000 USDC
                amount1: 500000000000000000n, // 0.5 WETH
              },
            },
          ],
        },
      },
    });

    const pool = await indexer.Pool.getOrThrow(POOL_ID);
    expect(pool.totalValueLockedToken0.toString()).toBe("199000");
    expect(pool.totalValueLockedToken1.toString()).toBe("59.5");
    expect(pool.collectedFeesToken0.toString()).toBe("1000");
    expect(pool.collectedFeesToken1.toString()).toBe("0.5");

    const collect = await indexer.Collect.getOrThrow(`${TX_HASH}-0`);
    expect(collect.owner).toBe(TX_FROM);
    expect(collect.amount0.toString()).toBe("1000");

    const usdcToken = await indexer.Token.getOrThrow(USDC_ID);
    expect(usdcToken.totalValueLocked.toString()).toBe("199000");
  });
});

describe("PoolCreated handler", () => {
  it("skips pools on the SKIP_POOLS list before doing any work", async () => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN_ID]: {
          simulate: [
            {
              contract: "UniswapV3Factory",
              event: "PoolCreated",
              block: { number: BLOCK_NUMBER, timestamp: TIMESTAMP },
              params: {
                token0: "0x6b175474e89094c44da98b954eedeac495271d0f",
                token1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
                fee: 3000n,
                tickSpacing: 60n,
                // mainnet SKIP_POOLS entry
                pool: "0x8fe8d9bb8eeba3ed688069c3d6b556c9ca258248",
              },
            },
          ],
        },
      },
    });

    expect(
      await indexer.Pool.get(`${CHAIN_ID}-0x8fe8d9bb8eeba3ed688069c3d6b556c9ca258248`)
    ).toBeUndefined();
    expect(await indexer.Factory.get(FACTORY_ID)).toBeUndefined();
  });
});
