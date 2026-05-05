import { TestHelpers, Pool, BigDecimal, Token } from "envio";
import { ChainConfig } from '../src/handlers/utils/chains';
import { ZERO_BD, ZERO_BI } from '../src/handlers/utils/constants';
import { isAddressInList } from '../src/handlers/utils/index';

const { UniswapV3Factory } = TestHelpers;

const FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const USDC_MAINNET_ADDRESS = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';
const WETH_MAINNET_ADDRESS = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1';
const WBTC_MAINNET_ADDRESS = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';
export const USDC_WETH_03_MAINNET_POOL = '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8';
export const WBTC_WETH_03_MAINNET_POOL = '0xcbcdf9626bc03e24f779434178a73a0b4bad62ed';
export const POOL_FEE_TIER_03 = 3000;
export const chainId = 42161;
export const timestamp = 1722420503;
export const blockNumber = 317209663;

export const TEST_CONFIG: ChainConfig = {
    factoryAddress: FACTORY_ADDRESS,
    stablecoinWrappedNativePoolId: USDC_WETH_03_MAINNET_POOL,
    stablecoinIsToken0: false,
    wrappedNativeAddress: WETH_MAINNET_ADDRESS,
    minimumNativeLocked: new BigDecimal("1"),
    stablecoinAddresses: [
        "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
        "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
        "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
        USDC_MAINNET_ADDRESS
    ],
    whitelistTokens: [
        WETH_MAINNET_ADDRESS, 
        USDC_MAINNET_ADDRESS,
        "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
        "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
        "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
        "0x0000000000000000000000000000000000000000",
    ],
    tokenOverrides: [],
    poolsToSkip: [],
    poolMappings: [],
    nativeTokenDetails: {
    symbol: "ETH",
        name: "Ethereum",
        decimals: BigInt(18),
    }
}

export const TEST_CONFIG_WITH_NO_WHITELIST: ChainConfig = {
  factoryAddress: FACTORY_ADDRESS,
  stablecoinWrappedNativePoolId: USDC_WETH_03_MAINNET_POOL,
  stablecoinIsToken0: true,
  wrappedNativeAddress: WETH_MAINNET_ADDRESS,
  minimumNativeLocked: ZERO_BD,
  stablecoinAddresses: [USDC_MAINNET_ADDRESS],
  whitelistTokens: [],
  tokenOverrides: [],
  poolsToSkip: [],
  poolMappings: [],
  nativeTokenDetails: {
    symbol: "ETH",
      name: "Ethereum",
      decimals: BigInt(18),
  }
}

export const TEST_CONFIG_WITH_POOL_SKIPPED: ChainConfig = {
  factoryAddress: FACTORY_ADDRESS,
  stablecoinWrappedNativePoolId: USDC_WETH_03_MAINNET_POOL,
  stablecoinIsToken0: true,
  wrappedNativeAddress: WETH_MAINNET_ADDRESS,
  minimumNativeLocked: ZERO_BD,
  stablecoinAddresses: [USDC_MAINNET_ADDRESS],
  whitelistTokens: [WETH_MAINNET_ADDRESS, USDC_MAINNET_ADDRESS],
  tokenOverrides: [],
  poolsToSkip: [USDC_WETH_03_MAINNET_POOL],
  poolMappings: [],
  nativeTokenDetails: {
    symbol: "ETH",
      name: "Ethereum",
      decimals: BigInt(18),
  }
}

export interface TokenFixture {
  address: string
  symbol: string
  name: string
  totalSupply: string
  decimals: string
  balanceOf: string
};

export const USDC_MAINNET_FIXTURE: TokenFixture = {
  address: USDC_MAINNET_ADDRESS,
  symbol: 'USDC',
  name: 'USD Coin',
  totalSupply: '300',
  decimals: '6',
  balanceOf: '1000',
}

export const WETH_MAINNET_FIXTURE: TokenFixture = {
  address: WETH_MAINNET_ADDRESS,
  symbol: 'WETH',
  name: 'Wrapped Ether',
  totalSupply: '100',
  decimals: '18',
  balanceOf: '500',
}

export const WBTC_MAINNET_FIXTURE: TokenFixture = {
  address: WBTC_MAINNET_ADDRESS,
  symbol: 'WBTC',
  name: 'Wrapped Bitcoin',
  totalSupply: '200',
  decimals: '8',
  balanceOf: '750',
}

export const getTokenFixture = (tokenAddress: string): TokenFixture => {
  if (tokenAddress == USDC_MAINNET_FIXTURE.address) {
    return USDC_MAINNET_FIXTURE
  } else if (tokenAddress == WETH_MAINNET_FIXTURE.address) {
    return WETH_MAINNET_FIXTURE
  } else if (tokenAddress == WBTC_MAINNET_FIXTURE.address) {
    return WBTC_MAINNET_FIXTURE
  } else {
    throw new Error('Token address not found in fixtures')
  }
}

export interface PoolFixture {
  address: string
  token0: TokenFixture
  token1: TokenFixture
  feeTier: string
  tickSpacing: string
  liquidity: string
};

export const USDC_WETH_03_MAINNET_POOL_FIXTURE: PoolFixture = {
  address: USDC_WETH_03_MAINNET_POOL,
  token0: USDC_MAINNET_FIXTURE,
  token1: WETH_MAINNET_FIXTURE,
  feeTier: '3000',
  tickSpacing: '60',
  liquidity: '100',
}

export const WBTC_WETH_03_MAINNET_POOL_FIXTURE: PoolFixture = {
  address: WBTC_WETH_03_MAINNET_POOL,
  token0: WBTC_MAINNET_FIXTURE,
  token1: WETH_MAINNET_FIXTURE,
  feeTier: '3000',
  tickSpacing: '60',
  liquidity: '200',
}

export const getPoolFixture = (poolAddress: string): PoolFixture => {
  if (poolAddress == USDC_WETH_03_MAINNET_POOL) {
    return USDC_WETH_03_MAINNET_POOL_FIXTURE
  } else if (poolAddress == WBTC_WETH_03_MAINNET_POOL) {
    return WBTC_WETH_03_MAINNET_POOL_FIXTURE
  } else {
    throw new Error('Pool address not found in fixtures')
  }
}

export const TEST_ETH_PRICE_USD = new BigDecimal('2000');
export const TEST_USDC_DERIVED_ETH = new BigDecimal('1').div(new BigDecimal('2000'));
export const TEST_WETH_DERIVED_ETH = new BigDecimal('1');

export async function invokePoolCreatedWithMockedEthCalls(
  chainConfig: ChainConfig,
  mockDb: any
): Promise<any> {
    const pool = getPoolFixture(chainConfig.stablecoinWrappedNativePoolId);
    const feeTier = pool.feeTier;
    const tickSpacing = pool.tickSpacing;
    const token0 = getTokenFixture(pool.token0.address);
    const token1 = getTokenFixture(pool.token1.address);

    const poolCreatedEvent = UniswapV3Factory.PoolCreated.createMockEvent({
        token0: token0.address,
        token1: token1.address,
        fee: BigInt(feeTier),
        tickSpacing: BigInt(tickSpacing),
        pool: chainConfig.stablecoinWrappedNativePoolId,
        mockEventData: {
            chainId,
            block: { timestamp, number: blockNumber }
        }
    });

    return UniswapV3Factory.PoolCreated.processEvent({ event: poolCreatedEvent, mockDb });
}

// More lightweight than the method above which invokes handlePoolCreated. This
// method only creates the pool entity while the above method also creates the
// relevant token and factory entities.
export const createAndStoreTestPool = (poolFixture: PoolFixture, chainId: number, mockDb: any): [Pool, any] => {
    const poolAddress = poolFixture.address.toLowerCase();
    const token0Address = poolFixture.token0.address.toLowerCase();
    const token1Address = poolFixture.token1.address.toLowerCase();
    const feeTier = parseInt(poolFixture.feeTier);

    const pool: Pool = {
        id: `${chainId}-${poolAddress}`,
        createdAtTimestamp: ZERO_BI,
        createdAtBlockNumber: ZERO_BI,
        token0_id: `${chainId}-${token0Address}`,
        token1_id: `${chainId}-${token1Address}`,
        feeTier: BigInt(feeTier),
        liquidity: ZERO_BI,
        sqrtPrice: ZERO_BI,
        token0Price: ZERO_BD,
        token1Price: ZERO_BD,
        tick: ZERO_BI,
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
        totalValueLockedUSD: ZERO_BD,
        totalValueLockedETH: ZERO_BD,
        totalValueLockedUSDUntracked: ZERO_BD,
        liquidityProviderCount: ZERO_BI,
    };
    
    mockDb = mockDb.entities.Pool.set(pool);
    return [pool, mockDb];
}

export const createAndStoreTestToken = (tokenFixture: TokenFixture, chainId: number, mockDb: any): [Token, any] => {
    const address = tokenFixture.address.toLowerCase();
    const {whitelistTokens} = TEST_CONFIG;
    const token: Token = {
        id: `${chainId}-${address}`,
        symbol: tokenFixture.symbol,
        name: tokenFixture.name,
        decimals: BigInt(tokenFixture.decimals),
        isWhitelisted: isAddressInList(address, whitelistTokens),
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

    mockDb = mockDb.entities.Token.set(token);
    return [token, mockDb];
}
