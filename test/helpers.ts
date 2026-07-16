/**
 * Shared fixtures for the v3 indexer test suite.
 *
 * Uses real Ethereum mainnet addresses so the handlers' CHAIN_CONFIGS[1]
 * lookups (whitelist, stablecoins, stable pool) behave exactly as in
 * production. The USDC/WETH 0.3% pool doubles as the chain's
 * stablecoinWrappedNativePool, so swap tests exercise the Bundle price path
 * naturally.
 */
import { BigDecimal, Pool, Token, Factory, Bundle } from "envio";
import { ZERO_BD, ZERO_BI, ADDRESS_ZERO } from "../src/handlers/utils/constants";

export const CHAIN_ID = 1;
export const FACTORY_ADDRESS = "0x1f98431c8ad98523631ae4a59f267346ea31f984";
export const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
export const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
// USDC/WETH 0.3% — also the mainnet stablecoinWrappedNativePool
export const USDC_WETH_03_POOL = "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8";

export const FACTORY_ID = `${CHAIN_ID}-${FACTORY_ADDRESS}`;
export const BUNDLE_ID = CHAIN_ID.toString();
export const POOL_ID = `${CHAIN_ID}-${USDC_WETH_03_POOL}`;
export const USDC_ID = `${CHAIN_ID}-${USDC}`;
export const WETH_ID = `${CHAIN_ID}-${WETH}`;

export const TIMESTAMP = 1722420503;
export const BLOCK_NUMBER = 20428078;
export const TX_HASH =
  "0xd6005a794596212a1bdc19178e04e18eb8e9e0963d7073303bcb47d6186e757e";
export const TX_FROM = "0xa79d3b28a109f0e3e4919c9715748db6d88f313f";
export const GAS_PRICE = 1000000000n;

export function makeFactory(overrides: Partial<Factory> = {}): Factory {
  return {
    id: FACTORY_ID,
    poolCount: 1n,
    numberOfSwaps: ZERO_BI,
    totalVolumeUSD: ZERO_BD,
    totalVolumeETH: ZERO_BD,
    totalFeesUSD: ZERO_BD,
    totalFeesETH: ZERO_BD,
    untrackedVolumeUSD: ZERO_BD,
    totalValueLockedUSD: ZERO_BD,
    totalValueLockedETH: ZERO_BD,
    totalValueLockedUSDUntracked: ZERO_BD,
    totalValueLockedETHUntracked: ZERO_BD,
    txCount: ZERO_BI,
    owner: ADDRESS_ZERO,
    ...overrides,
  };
}

export function makeBundle(ethPriceUSD: BigDecimal = ZERO_BD): Bundle {
  return { id: BUNDLE_ID, ethPriceUSD };
}

export function makeToken(
  id: string,
  symbol: string,
  name: string,
  decimals: bigint,
  overrides: Partial<Token> = {}
): Token {
  return {
    id,
    symbol,
    name,
    decimals,
    totalSupply: ZERO_BI,
    isWhitelisted: true,
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
    whitelistPools: [POOL_ID],
    ...overrides,
  };
}

export function makePool(overrides: Partial<Pool> = {}): Pool {
  return {
    id: POOL_ID,
    createdAtTimestamp: BigInt(TIMESTAMP),
    createdAtBlockNumber: BigInt(BLOCK_NUMBER),
    token0_id: USDC_ID,
    token1_id: WETH_ID,
    feeTier: 3000n,
    liquidity: ZERO_BI,
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
    totalValueLockedToken0: ZERO_BD,
    totalValueLockedToken1: ZERO_BD,
    totalValueLockedETH: ZERO_BD,
    totalValueLockedUSD: ZERO_BD,
    totalValueLockedUSDUntracked: ZERO_BD,
    liquidityProviderCount: ZERO_BI,
    ...overrides,
  };
}

// Real values from mainnet swap
// https://etherscan.io/tx/0xd6005a794596212a1bdc19178e04e18eb8e9e0963d7073303bcb47d6186e757e#eventlog
export const SWAP_FIXTURE = {
  sender: "0x6f1cdbbb4d53d226cf4b917bf768b94acbab6168",
  recipient: "0x6f1cdbbb4d53d226cf4b917bf768b94acbab6168",
  amount0: -77505140556n, // USDC out
  amount1: 20824112148200096620n, // WETH in
  sqrtPriceX96: 1296814378469562426931209291431936n,
  liquidity: 8433670604946078834n,
  tick: 194071n,
};

/** In-memory context standing in for the handler context in pure-function
 * tests (pricing, intervalUpdates). */
export function makeMockContext(
  entities: { Pool?: any[]; Token?: any[]; Bundle?: any[] } & {
    [name: string]: any[] | undefined;
  } = {}
) {
  const stores = new Map<string, Map<string, any>>();
  const store = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name)!;
  };
  for (const [name, list] of Object.entries(entities)) {
    for (const e of list ?? []) store(name).set(e.id, e);
  }
  return new Proxy(
    {},
    {
      get: (_t, name: string) => ({
        get: async (id: string) => store(name).get(id),
        set: (entity: any) => {
          store(name).set(entity.id, entity);
        },
      }),
    }
  ) as any;
}
