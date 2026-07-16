import { indexer, Bundle, Token, Pool, Factory } from "envio";
import { ZERO_BD, ZERO_BI, ONE_BI, ADDRESS_ZERO } from "./utils/constants";
import { CHAIN_CONFIGS } from "./utils/chains";
import { convertTokenToDecimal, isAddressInList } from "./utils/index";
import { getTokenMetadataEffect } from "./utils/tokenMetadataEffect";
import { getPoolBackfillDataEffect } from "./utils/poolBackfillEffect";

indexer.contractRegister(
  { contract: "UniswapV3Factory", event: "PoolCreated" },
  async ({ event, context }) => {
    context.chain.UniswapV3Pool.add(event.params.pool);
  }
);

// Mutable version of the (readonly) generated entity type
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// Build a fresh Token entity from fetched metadata; returns null when
// decimals could not be determined (subgraph: "bail if we couldn't figure out
// the decimals" — the pool is then never indexed).
async function fetchToken(
  context: any,
  chainId: number,
  tokenAddress: string,
  whitelistTokens: string[]
): Promise<Mutable<Token> | null> {
  const metadata = await context.effect(getTokenMetadataEffect, {
    address: tokenAddress,
    chainId,
  });

  if (metadata.decimals === null || metadata.decimals === undefined) {
    return null;
  }

  return {
    id: `${chainId}-${tokenAddress.toLowerCase()}`,
    symbol: metadata.symbol,
    name: metadata.name,
    decimals: BigInt(metadata.decimals),
    totalSupply: metadata.totalSupply,
    isWhitelisted: isAddressInList(tokenAddress, whitelistTokens),
    volume: ZERO_BD,
    volumeUSD: ZERO_BD,
    untrackedVolumeUSD: ZERO_BD,
    feesUSD: ZERO_BD,
    txCount: ZERO_BI,
    poolCount: ZERO_BI,
    totalValueLocked: ZERO_BD,
    totalValueLockedUSD: ZERO_BD,
    totalValueLockedUSDUntracked: ZERO_BD,
    derivedETH: ZERO_BD,
    whitelistPools: [],
  };
}

/**
 * Create entries in store for hard-coded pools and tokens. This is only used
 * for generating Optimism pre-regenesis data (subgraph populateEmptyPools).
 * The pool addresses are also statically registered in config.yaml so their
 * events are picked up from the start block.
 */
async function populateEmptyPools(
  context: any,
  chainId: number,
  blockNumber: number,
  timestamp: number,
  whitelistTokens: string[]
): Promise<void> {
  const { poolMappings } = CHAIN_CONFIGS[chainId];

  for (const poolMapping of poolMappings) {
    const poolId = `${chainId}-${poolMapping.newAddress}`;
    const token0Id = `${chainId}-${poolMapping.token0}`;
    const token1Id = `${chainId}-${poolMapping.token1}`;

    const [backfill, existingToken0, existingToken1] = await Promise.all([
      context.effect(getPoolBackfillDataEffect, {
        poolAddress: poolMapping.newAddress,
        token0: poolMapping.token0,
        token1: poolMapping.token1,
        chainId,
        blockNumber,
      }),
      context.Token.get(token0Id),
      context.Token.get(token1Id),
    ]);

    const token0 =
      existingToken0 ? { ...existingToken0 } :
      await fetchToken(context, chainId, poolMapping.token0, whitelistTokens);
    const token1 =
      existingToken1 ? { ...existingToken1 } :
      await fetchToken(context, chainId, poolMapping.token1, whitelistTokens);

    // Subgraph only saves the pool when both tokens resolved
    if (!token0 || !token1) continue;

    const pool: Pool = {
      id: poolId,
      createdAtTimestamp: BigInt(timestamp),
      createdAtBlockNumber: BigInt(blockNumber),
      token0_id: token0.id,
      token1_id: token1.id,
      feeTier: BigInt(backfill.feeTier),
      liquidity: backfill.liquidity,
      sqrtPrice: ZERO_BI,
      token0Price: ZERO_BD,
      token1Price: ZERO_BD,
      tick: undefined,
      observationIndex: ZERO_BI,
      volumeToken0: ZERO_BD,
      volumeToken1: ZERO_BD,
      volumeUSD: ZERO_BD,
      untrackedVolumeUSD: ZERO_BD,
      feesUSD: ZERO_BD,
      txCount: ZERO_BI,
      collectedFeesToken0: ZERO_BD,
      collectedFeesToken1: ZERO_BD,
      collectedFeesUSD: ZERO_BD,
      totalValueLockedToken0: convertTokenToDecimal(backfill.balance0, token0.decimals),
      totalValueLockedToken1: convertTokenToDecimal(backfill.balance1, token1.decimals),
      totalValueLockedETH: ZERO_BD,
      totalValueLockedUSD: ZERO_BD,
      totalValueLockedUSDUntracked: ZERO_BD,
      liquidityProviderCount: ZERO_BI,
    };

    token0.totalValueLocked = pool.totalValueLockedToken0;
    token1.totalValueLocked = pool.totalValueLockedToken1;

    // update white listed pools
    if (token0.isWhitelisted) {
      token1.whitelistPools = [...token1.whitelistPools, pool.id];
    }
    if (token1.isWhitelisted) {
      token0.whitelistPools = [...token0.whitelistPools, pool.id];
    }

    context.Pool.set(pool);
    context.Token.set(token0);
    context.Token.set(token1);
  }
}

indexer.onEvent(
  { contract: "UniswapV3Factory", event: "PoolCreated" },
  async ({ event, context }) => {
    const { factoryAddress, poolsToSkip, whitelistTokens, poolMappings } =
      CHAIN_CONFIGS[event.chainId];

    // temp fix
    if (isAddressInList(event.params.pool, poolsToSkip)) {
      return;
    }

    const factoryId = `${event.chainId}-${factoryAddress.toLowerCase()}`;
    const token0Address = event.params.token0.toLowerCase();
    const token1Address = event.params.token1.toLowerCase();

    const [factoryRO, token0RO, token1RO] = await Promise.all([
      context.Factory.get(factoryId),
      context.Token.get(`${event.chainId}-${token0Address}`),
      context.Token.get(`${event.chainId}-${token1Address}`),
    ]);

    let factory: Mutable<Factory>;

    if (factoryRO) {
      factory = { ...factoryRO };
    } else {
      factory = {
        id: factoryId,
        poolCount: ZERO_BI,
        numberOfSwaps: ZERO_BI,
        totalVolumeETH: ZERO_BD,
        totalVolumeUSD: ZERO_BD,
        untrackedVolumeUSD: ZERO_BD,
        totalFeesUSD: ZERO_BD,
        totalFeesETH: ZERO_BD,
        totalValueLockedETH: ZERO_BD,
        totalValueLockedUSD: ZERO_BD,
        totalValueLockedUSDUntracked: ZERO_BD,
        totalValueLockedETHUntracked: ZERO_BD,
        txCount: ZERO_BI,
        owner: ADDRESS_ZERO,
      };

      // create new bundle for tracking eth price
      const bundle: Bundle = {
        id: event.chainId.toString(),
        ethPriceUSD: ZERO_BD,
      };

      context.Bundle.set(bundle);

      // backfill pre-regenesis pools (optimism only; no-op elsewhere)
      if (poolMappings.length > 0) {
        await populateEmptyPools(
          context,
          event.chainId,
          event.block.number,
          event.block.timestamp,
          whitelistTokens
        );
      }
    }

    factory.poolCount = factory.poolCount + ONE_BI;

    const token0 = token0RO
      ? { ...token0RO }
      : await fetchToken(context, event.chainId, token0Address, whitelistTokens);
    const token1 = token1RO
      ? { ...token1RO }
      : await fetchToken(context, event.chainId, token1Address, whitelistTokens);

    // bail if we couldn't figure out the decimals (subgraph parity: such
    // pools are never indexed)
    if (!token0 || !token1) {
      return;
    }

    const pool: Pool = {
      id: `${event.chainId}-${event.params.pool.toLowerCase()}`,
      createdAtTimestamp: BigInt(event.block.timestamp),
      createdAtBlockNumber: BigInt(event.block.number),
      token0_id: token0.id,
      token1_id: token1.id,
      feeTier: event.params.fee,
      liquidity: ZERO_BI,
      sqrtPrice: ZERO_BI,
      token0Price: ZERO_BD,
      token1Price: ZERO_BD,
      // subgraph leaves tick null until the pool's Initialize event
      tick: undefined,
      observationIndex: ZERO_BI,
      volumeToken0: ZERO_BD,
      volumeToken1: ZERO_BD,
      volumeUSD: ZERO_BD,
      untrackedVolumeUSD: ZERO_BD,
      feesUSD: ZERO_BD,
      txCount: ZERO_BI,
      collectedFeesToken0: ZERO_BD,
      collectedFeesToken1: ZERO_BD,
      collectedFeesUSD: ZERO_BD,
      totalValueLockedToken0: ZERO_BD,
      totalValueLockedToken1: ZERO_BD,
      totalValueLockedETH: ZERO_BD,
      totalValueLockedUSD: ZERO_BD,
      totalValueLockedUSDUntracked: ZERO_BD,
      liquidityProviderCount: ZERO_BI,
    };

    // update white listed pools
    if (token0.isWhitelisted) {
      token1.whitelistPools = [...token1.whitelistPools, pool.id];
    }

    if (token1.isWhitelisted) {
      token0.whitelistPools = [...token0.whitelistPools, pool.id];
    }

    context.Pool.set(pool);
    context.Token.set(token0);
    context.Token.set(token1);
    context.Factory.set(factory);
  }
);
