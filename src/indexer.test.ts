/**
 * E2E integration tests for the Uniswap V3 indexer.
 *
 * Replays real Ethereum mainnet history through the handlers via
 * createTestIndexer() (HyperSync-backed). Requires ENVIO_API_TOKEN and an
 * ENVIO_MAINNET_RPC_URL in .env (token metadata is fetched over RPC for
 * PoolCreated events).
 *
 * Block anchors (verified against HyperSync):
 * - 12369621: factory deployment (config start_block)
 * - 12369739: first PoolCreated — UNI/WETH 0.3% (0x1d42064f…) — whose
 *   Initialize and first Mint land in the SAME block
 * - 12373187: first Swap on that pool
 */
import { describe, it } from "vitest";
import { createTestIndexer } from "envio";
import * as dotenv from "dotenv";

dotenv.config();

const FIRST_POOL = "1-0x1d42064fc4beb5f8aaf85f4617ae8b3b5b8bd801";
const UNI = "1-0x1f9840a85d5af5bf1d1762f925bdaddc4201f984";
const WETH = "1-0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

describe("Uniswap V3 Indexer (mainnet replay)", () => {
  it(
    "replays the first pool's creation, initialize, mint and first swap",
    { timeout: 300_000 },
    async (t) => {
      const indexer = createTestIndexer();

      // PoolCreated + Initialize + Mint all land in block 12369739
      const bootstrap = await indexer.process({
        chains: {
          1: { startBlock: 12369621, endBlock: 12369739 },
        },
      });

      const bootstrapEvents = bootstrap.changes.reduce(
        (acc, c) => acc + c.eventsProcessed,
        0
      );
      t.expect(bootstrapEvents, "PoolCreated + Initialize + Mint").toBe(3);

      const factory = await indexer.Factory.getOrThrow(
        "1-0x1f98431c8ad98523631ae4a59f267346ea31f984"
      );
      t.expect(factory.poolCount).toBe(1n);
      t.expect(factory.txCount, "the mint counted").toBe(1n);

      // no stablecoin/native pool exists yet → ETH price unknown
      const bundle = await indexer.Bundle.getOrThrow("1");
      t.expect(bundle.ethPriceUSD.isZero()).toBe(true);

      const pool = await indexer.Pool.getOrThrow(FIRST_POOL);
      t.expect(pool.token0_id).toBe(UNI);
      t.expect(pool.token1_id).toBe(WETH);
      t.expect(pool.feeTier).toBe(3000n);
      t.expect(pool.sqrtPrice > 0n, "Initialize set sqrtPrice").toBe(true);
      t.expect(pool.tick).not.toBeUndefined();
      t.expect(pool.liquidity > 0n, "first mint is in range").toBe(true);
      t.expect(pool.totalValueLockedToken1.gt(0), "WETH deposited").toBe(true);

      // token metadata fetched over RPC — real mainnet values
      const uni = await indexer.Token.getOrThrow(UNI);
      t.expect(uni.symbol).toBe("UNI");
      t.expect(uni.name).toBe("Uniswap");
      t.expect(uni.decimals).toBe(18n);
      t.expect(uni.totalSupply).toBe(10n ** 27n); // fixed 1B supply
      t.expect(uni.isWhitelisted).toBe(false);
      // WETH is whitelisted → this pool prices UNI, not the reverse
      t.expect(uni.whitelistPools).toContain(FIRST_POOL);

      const weth = await indexer.Token.getOrThrow(WETH);
      t.expect(weth.symbol).toBe("WETH");
      t.expect(weth.isWhitelisted).toBe(true);
      t.expect(weth.whitelistPools).not.toContain(FIRST_POOL);
      // wrapped native fast path fires on Initialize
      t.expect(weth.derivedETH.toString()).toBe("1");

      // mint bookkeeping
      const ticks = await indexer.Tick.getAll();
      t.expect(ticks).toHaveLength(2);
      const [lower, upper] = ticks.sort((a, b) =>
        a.tickIdx < b.tickIdx ? -1 : 1
      );
      t.expect(lower!.liquidityNet).toBe(lower!.liquidityGross);
      t.expect(upper!.liquidityNet).toBe(-upper!.liquidityGross);

      const mints = await indexer.Mint.getAll();
      t.expect(mints).toHaveLength(1);
      t.expect(mints[0]!.amount).toBe(pool.liquidity);
      t.expect(mints[0]!.origin).toMatch(/^0x[0-9a-f]{40}$/); // lowercase

      // continue to the pool's first swap; other early pools (USDC/WETH etc.)
      // get created along the way and fetch their metadata over RPC
      await indexer.process({
        chains: {
          1: { endBlock: 12373187 },
        },
      });

      const poolAfterSwap = await indexer.Pool.getOrThrow(FIRST_POOL);
      t.expect(poolAfterSwap.token0Price.gt(0), "swap set prices").toBe(true);
      t.expect(poolAfterSwap.token1Price.gt(0)).toBe(true);
      t.expect(poolAfterSwap.volumeToken1.gt(0)).toBe(true);

      const factoryAfterSwap = await indexer.Factory.getOrThrow(
        "1-0x1f98431c8ad98523631ae4a59f267346ea31f984"
      );
      t.expect(factoryAfterSwap.numberOfSwaps >= 1n).toBe(true);
      t.expect(factoryAfterSwap.poolCount > 1n, "more pools by now").toBe(true);

      const swaps = await indexer.Swap.getAll();
      const poolSwaps = swaps.filter((s) => s.pool_id === FIRST_POOL);
      t.expect(poolSwaps.length).toBeGreaterThanOrEqual(1);
      const swap = poolSwaps[0]!;
      // UNI leaves, WETH enters (or vice versa) — deltas have opposite signs
      t.expect(swap.amount0.isNegative() !== swap.amount1.isNegative()).toBe(
        true
      );
      t.expect(swap.sqrtPriceX96 > 0n).toBe(true);
    }
  );
});

describe("Optimism pre-regenesis backfill", () => {
  it(
    "creates the POOL_MAPINGS pools on the first post-regenesis PoolCreated",
    { timeout: 600_000 },
    async (t) => {
      const indexer = createTestIndexer();

      // 46549 is the first PoolCreated after the subgraph's OP start block
      // (27446); the factory bootstrap + populateEmptyPools fire here, with
      // liquidity/fee/balances read at this exact block over archive RPC.
      await indexer.process({
        chains: {
          10: { startBlock: 27446, endBlock: 46549 },
        },
      });

      const factory = await indexer.Factory.getOrThrow(
        "10-0x1f98431c8ad98523631ae4a59f267346ea31f984"
      );
      // backfilled pools do not count towards poolCount (subgraph parity)
      t.expect(factory.poolCount).toBe(1n);

      const pools = await indexer.Pool.getAll();
      // 103 mappings + the pool from the PoolCreated event itself (a mapping
      // entry is only skipped if its token metadata is unreadable)
      t.expect(pools.length).toBe(104);

      // WETH/DAI 0.3% — liquidity/fee verified against archive state
      const wethDai = await indexer.Pool.getOrThrow(
        "10-0x03af20bdaaffb4cc0a521796a223f7d85e2aac31"
      );
      t.expect(wethDai.liquidity).toBe(587218525905507716872725n);
      t.expect(wethDai.feeTier).toBe(3000n);
      t.expect(wethDai.totalValueLockedToken0.gt(0), "WETH balance").toBe(true);
      t.expect(wethDai.totalValueLockedToken1.gt(0), "DAI balance").toBe(true);
      // pre-regenesis pools await their first post-regenesis swap for a price
      t.expect(wethDai.sqrtPrice).toBe(0n);
      t.expect(wethDai.tick).toBeUndefined();

      const weth = await indexer.Token.getOrThrow(
        "10-0x4200000000000000000000000000000000000006"
      );
      t.expect(weth.symbol).toBe("WETH");
      const dai = await indexer.Token.getOrThrow(
        "10-0xda10009cbd5d07dd0cecc66161fc93d7c9000da1"
      );
      t.expect(dai.symbol).toBe("DAI");
      // WETH is whitelisted → the pool prices DAI's side
      t.expect(dai.whitelistPools).toContain(
        "10-0x03af20bdaaffb4cc0a521796a223f7d85e2aac31"
      );
    }
  );
});
