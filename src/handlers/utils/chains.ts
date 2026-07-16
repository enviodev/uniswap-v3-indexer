import { BigDecimal } from "envio";
import { StaticTokenDefinition } from "./staticTokenDefinition";
import { NativeTokenDetails } from "./nativeTokenDetails";
import { OPTIMISM_POOL_MAPPINGS, PoolMapping } from "./optimismPoolMappings";

// Chain IDs (all chains supported by the Uniswap v3 subgraph that have a
// HyperSync instance; see config.yaml for the matching network entries)
export enum ChainId {
  MAINNET = 1,
  OPTIMISM = 10,
  ARBITRUM_ONE = 42161,
  BASE = 8453,
  MATIC = 137,
  BSC = 56,
  AVALANCHE = 43114,
  BLAST = 81457,
  ZORA = 7777777,
  WORLDCHAIN = 480,
  UNICHAIN = 130,
  SONEIUM = 1868,
  INK = 57073,
  LINEA = 59144,
  CELO = 42220,
  MONAD = 143,
}

// Configuration interface for each chain — mirrors the constants each
// v3-subgraph config/<chain>/chain.ts exposes.
export interface ChainConfig {
  factoryAddress: string;
  // The subgraph's STABLE_TOKEN_POOL: wrapped-native/stable pool used to
  // price the native token in USD. Orientation is resolved dynamically
  // (subgraph-style) by comparing pool.token0 to wrappedNativeAddress.
  stablecoinWrappedNativePoolId: string;
  wrappedNativeAddress: string; // REFERENCE_TOKEN
  minimumNativeLocked: BigDecimal; // MINIMUM_NATIVE_LOCKED
  stablecoinAddresses: string[]; // STABLE_COINS
  whitelistTokens: string[]; // WHITELIST_TOKENS
  tokenOverrides: StaticTokenDefinition[]; // STATIC_TOKEN_DEFINITIONS
  poolsToSkip: string[]; // SKIP_POOLS
  // Pre-regenesis pool backfill (subgraph POOL_MAPINGS; optimism only)
  poolMappings: PoolMapping[];
  nativeTokenDetails: NativeTokenDetails;
}

// Chain-specific configurations, generated 1:1 from
// v3-subgraph/config/<chain>/chain.ts. All addresses lowercase.
export const CHAIN_CONFIGS: { [chainId: number]: ChainConfig } = {
  // ethereum (startblock 12369621)
  [ChainId.MAINNET]: {
    factoryAddress: "0x1f98431c8ad98523631ae4a59f267346ea31f984",
    stablecoinWrappedNativePoolId: "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8",
    wrappedNativeAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
    minimumNativeLocked: new BigDecimal("20"),
    stablecoinAddresses: [
      "0x6b175474e89094c44da98b954eedeac495271d0f",
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "0xdac17f958d2ee523a2206206994597c13d831ec7",
      "0x0000000000085d4780b73119b644ae5ecd22b376",
      "0x956f47f50a910163d8bf957cf5846d573e7f87ca",
      "0x4dd28568d05f09b02220b09c2cb307bfd837cb95",
    ],
    whitelistTokens: [
      "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
      "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
      "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
      "0x0000000000085d4780b73119b644ae5ecd22b376", // TUSD
      "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
      "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643", // cDAI
      "0x39aa39c021dfbae8fac545936693ac917d5e7563", // cUSDC
      "0x86fadb80d8d2cff3c3680819e4da99c10232ba0f", // EBASE
      "0x57ab1ec28d129707052df4df418d58a2d46d5f51", // sUSD
      "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2", // MKR
      "0xc00e94cb662c3520282e6f5717214004a7f26888", // COMP
      "0x514910771af9ca656af840dff83e8264ecf986ca", // LINK
      "0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f", // SNX
      "0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e", // YFI
      "0x111111111117dc0aa78b770fa6a738034120c302", // 1INCH
      "0xdf5e0e81dff6faf3a7e52ba697820c5e32d806a8", // yCurv
      "0x956f47f50a910163d8bf957cf5846d573e7f87ca", // FEI
      "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0", // MATIC
      "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", // AAVE
      "0xfe2e637202056d30016725477c5da089ab0a043a", // sETH2
    ],
    tokenOverrides: [
      {
        address: "0xe0b7927c4af23765cb51314a0e0521a9645f0e2a",
        symbol: "DGD",
        name: "DGD",
        decimals: BigInt(9),
      },
      {
        address: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
        symbol: "AAVE",
        name: "Aave Token",
        decimals: BigInt(18),
      },
      {
        address: "0xeb9951021698b42e4399f9cbb6267aa35f82d59d",
        symbol: "LIF",
        name: "Lif",
        decimals: BigInt(18),
      },
      {
        address: "0xbdeb4b83251fb146687fa19d1c660f99411eefe3",
        symbol: "SVD",
        name: "savedroid",
        decimals: BigInt(18),
      },
      {
        address: "0xbb9bc244d798123fde783fcc1c72d3bb8c189413",
        symbol: "TheDAO",
        name: "TheDAO",
        decimals: BigInt(16),
      },
      {
        address: "0x38c6a68304cdefb9bec48bbfaaba5c5b47818bb2",
        symbol: "HPB",
        name: "HPBCoin",
        decimals: BigInt(18),
      },
    ],
    poolsToSkip: [
      "0x8fe8d9bb8eeba3ed688069c3d6b556c9ca258248",
    ],
    poolMappings: [],
    nativeTokenDetails: {
      symbol: "ETH",
      name: "Ethereum",
      decimals: BigInt(18),
    },
  },
  // optimism (startblock 27446)
  [ChainId.OPTIMISM]: {
    factoryAddress: "0x1f98431c8ad98523631ae4a59f267346ea31f984",
    stablecoinWrappedNativePoolId: "0x85149247691df622eaf1a8bd0cafd40bc45154a9",
    wrappedNativeAddress: "0x4200000000000000000000000000000000000006", // WETH
    minimumNativeLocked: new BigDecimal("10"),
    stablecoinAddresses: [
      "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
      "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
      "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
    ],
    whitelistTokens: [
      "0x4200000000000000000000000000000000000006", // WETH
      "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", // DAI
      "0x7f5c764cbc14f9669b88837ca1490cca17c31607", // USDC
      "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", // USDT
      "0x4200000000000000000000000000000000000042", // OP
      "0x9e1028f5f1d5ede59748ffcee5532509976840e0", // PERP
      "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // LYRA
      "0x68f180fcce6836688e9084f035309e29bf0a2095", // WBT
    ],
    tokenOverrides: [
      {
        address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
        symbol: "WETH",
        name: "Wrapped Ethereum",
        decimals: BigInt(18),
      },
    ],
    poolsToSkip: [
      "0x282b7d6bef6c78927f394330dca297eca2bd18cd",
      "0x5738de8d0b864d5ef5d65b9e05b421b71f2c2eb4",
      "0x5500721e5a063f0396c5e025a640e8491eb89aac",
      "0x1ffd370f9d01f75de2cc701956886acec9749e80",
    ],
    poolMappings: OPTIMISM_POOL_MAPPINGS,
    nativeTokenDetails: {
      symbol: "ETH",
      name: "Ethereum",
      decimals: BigInt(18),
    },
  },
  // arbitrum-one (startblock 175)
  [ChainId.ARBITRUM_ONE]: {
    factoryAddress: "0x1f98431c8ad98523631ae4a59f267346ea31f984",
    stablecoinWrappedNativePoolId: "0x17c14d2c404d167802b16c450d3c99f88f2c4f4d",
    wrappedNativeAddress: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    minimumNativeLocked: new BigDecimal("20"),
    stablecoinAddresses: [
      "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", // USDC
      "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", // DAI
      "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT
      "0xaf88d065e77c8cc2239327c5edb3a432268e5831", // USDC
    ],
    whitelistTokens: [
      "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
      "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", // USDC
      "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", // DAI
      "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT
      "0xaf88d065e77c8cc2239327c5edb3a432268e5831", // USDC
    ],
    tokenOverrides: [
      {
        address: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
        symbol: "USDC",
        name: "USD Coin",
        decimals: BigInt(6),
      },
    ],
    poolsToSkip: [],
    poolMappings: [],
    nativeTokenDetails: {
      symbol: "ETH",
      name: "Ethereum",
      decimals: BigInt(18),
    },
  },
  // base (startblock 2009445)
  [ChainId.BASE]: {
    factoryAddress: "0x33128a8fc17869897dce68ed026d694621f6fdfd",
    stablecoinWrappedNativePoolId: "0x4c36388be6f416a29c8d8eee81c771ce6be14b18",
    wrappedNativeAddress: "0x4200000000000000000000000000000000000006", // WETH
    minimumNativeLocked: new BigDecimal("4"),
    stablecoinAddresses: [
      "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // USDC
    ],
    whitelistTokens: [
      "0x4200000000000000000000000000000000000006", // WETH
      "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // USDC
      "0x1111111111166b7fe7bd91427724b487980afc69", // ZORA
    ],
    tokenOverrides: [],
    poolsToSkip: [],
    poolMappings: [],
    nativeTokenDetails: {
      symbol: "ETH",
      name: "Ethereum",
      decimals: BigInt(18),
    },
  },
  // matic (startblock 22757547)
  [ChainId.MATIC]: {
    factoryAddress: "0x1f98431c8ad98523631ae4a59f267346ea31f984",
    stablecoinWrappedNativePoolId: "0xa374094527e1673a86de625aa59517c5de346d32",
    wrappedNativeAddress: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", // WMATIC
    minimumNativeLocked: new BigDecimal("20000"),
    stablecoinAddresses: [
      "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // Bridged USDC
      "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", // DAI
      "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // USDC
      "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT
    ],
    whitelistTokens: [
      "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", // WMATIC
      "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH
      "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // Bridged USDC
      "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", // DA
      "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // USDC
      "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT
    ],
    tokenOverrides: [],
    poolsToSkip: [],
    poolMappings: [],
    nativeTokenDetails: {
      symbol: "POL",
      name: "Polygon Ecosystem Token",
      decimals: BigInt(18),
    },
  },
  // bsc (startblock 12369621)
  [ChainId.BSC]: {
    factoryAddress: "0xdb1d10011ad0ff90774d0c6bb92e5c5c8b4461f7",
    stablecoinWrappedNativePoolId: "0x6fe9e9de56356f7edbfcbb29fab7cd69471a4869",
    wrappedNativeAddress: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", // WETH
    minimumNativeLocked: new BigDecimal("100"),
    stablecoinAddresses: [
      "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
      "0x55d398326f99059ff775485246999027b3197955",
      "0xe9e7cea3dedca5984780bafc599bd69add087d56",
    ],
    whitelistTokens: [
      "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", // WETH
      "0xe9e7cea3dedca5984780bafc599bd69add087d56", // BUSD
      "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC
      "0x55d398326f99059ff775485246999027b3197955", // USDT
    ],
    tokenOverrides: [],
    poolsToSkip: [],
    poolMappings: [],
    nativeTokenDetails: {
      symbol: "BNB",
      name: "Binance Coin",
      decimals: BigInt(18),
    },
  },
  // avalanche (startblock 27832971)
  [ChainId.AVALANCHE]: {
    factoryAddress: "0x740b1c1de25031c31ff4fc9a62f554a55cdc1bad",
    stablecoinWrappedNativePoolId: "0xfae3f424a0a47706811521e3ee268f00cfb5c45e",
    wrappedNativeAddress: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7", // WETH
    minimumNativeLocked: new BigDecimal("1000"),
    stablecoinAddresses: [
      "0xd586e7f844cea2f87f50152665bcbc2c279d8d70", // dai.e
      "0xba7deebbfc5fa1100fb055a87773e1e99cd3507a", // dai
      "0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664", // usdc.e
      "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // usdc
      "0xc7198437980c041c805a1edcba50c1ce5db95118", // usdt.e
      "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", // usdt
    ],
    whitelistTokens: [
      "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7", // WETH
      "0xd586e7f844cea2f87f50152665bcbc2c279d8d70", // dai.e
      "0xba7deebbfc5fa1100fb055a87773e1e99cd3507a", // dai
      "0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664", // usdc.e
      "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // usdc
      "0xc7198437980c041c805a1edcba50c1ce5db95118", // usdt.e
      "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", // usdt
      "0x130966628846bfd36ff31a822705796e8cb8c18d", // mim
    ],
    tokenOverrides: [],
    poolsToSkip: [],
    poolMappings: [],
    nativeTokenDetails: {
      symbol: "AVAX",
      name: "Avalanche",
      decimals: BigInt(18),
    },
  },
  // blast-mainnet (startblock 400903)
  [ChainId.BLAST]: {
    factoryAddress: "0x792edade80af5fc680d96a2ed80a44247d2cf6fd",
    stablecoinWrappedNativePoolId: "0xf52b4b69123cbcf07798ae8265642793b2e8990c",
    wrappedNativeAddress: "0x4300000000000000000000000000000000000004", // WETH
    minimumNativeLocked: new BigDecimal("1"),
    stablecoinAddresses: [
      "0x4300000000000000000000000000000000000003", // USDB
    ],
    whitelistTokens: [
      "0x4300000000000000000000000000000000000004", // WETH
      "0x4300000000000000000000000000000000000003", // USDB
    ],
    tokenOverrides: [],
    poolsToSkip: [],
    poolMappings: [],
    nativeTokenDetails: {
      symbol: "ETH",
      name: "Ethereum",
      decimals: BigInt(18),
    },
  },
  // zora-mainnet (startblock 10320368)
  [ChainId.ZORA]: {
    factoryAddress: "0x7145f8aeef1f6510e92164038e1b6f8cb2c42cbb",
    stablecoinWrappedNativePoolId: "0xbc59f8f3b275aa56a90d13bae7cce5e6e11a3b17",
    wrappedNativeAddress: "0x4200000000000000000000000000000000000006", // WETH
    minimumNativeLocked: new BigDecimal("1"),
    stablecoinAddresses: [
      "0xcccccccc7021b32ebb4e8c08314bd62f7c653ec4", // USDzC
    ],
    whitelistTokens: [
      "0x4200000000000000000000000000000000000006", // WETH
      "0xcccccccc7021b32ebb4e8c08314bd62f7c653ec4", // USDz
    ],
    tokenOverrides: [],
    poolsToSkip: [],
    poolMappings: [],
    nativeTokenDetails: {
      symbol: "ETH",
      name: "Ethereum",
      decimals: BigInt(18),
    },
  },
  // worldchain-mainnet (startblock 1603366)
  [ChainId.WORLDCHAIN]: {
    factoryAddress: "0x7a5028bda40e7b173c278c5342087826455ea25a",
    stablecoinWrappedNativePoolId: "0x5f835420502a7702de50cd0e78d8aa3608b2137e",
    wrappedNativeAddress: "0x4200000000000000000000000000000000000006", // WETH
    minimumNativeLocked: new BigDecimal("1"),
    stablecoinAddresses: [
      "0x79a02482a880bce3f13e09da970dc34db4cd24d1", // USDC.e
    ],
    whitelistTokens: [
      "0x4200000000000000000000000000000000000006", // WETH
      "0x79a02482a880bce3f13e09da970dc34db4cd24d1", // USDC.e
      "0x03c7054bcb39f7b2e5b2c7acb37583e32d70cfa3", // WBTC
      "0x2cfc85d8e48f8eab294be644d9e25c3030863003", // WLD
      "0x859dbe24b90c9f2f7742083d3cf59ca41f55be5d", // sDAI
    ],
    tokenOverrides: [],
    poolsToSkip: [],
    poolMappings: [],
    nativeTokenDetails: {
      symbol: "ETH",
      name: "Ethereum",
      decimals: BigInt(18),
    },
  },
  // unichain-mainnet (startblock 0)
  [ChainId.UNICHAIN]: {
    factoryAddress: "0x1f98400000000000000000000000000000000003",
    stablecoinWrappedNativePoolId: "0x65081cb48d74a32e9ccfed75164b8c09972dbcf1",
    wrappedNativeAddress: "0x4200000000000000000000000000000000000006", // WETH
    minimumNativeLocked: new BigDecimal("1"),
    stablecoinAddresses: [
      "0x078d782b760474a361dda0af3839290b0ef57ad6", // USDC
      "0x20cab320a855b39f724131c69424240519573f81", // DAI
    ],
    whitelistTokens: [
      "0x4200000000000000000000000000000000000006", // WETH
      "0x078d782b760474a361dda0af3839290b0ef57ad6", // USDC
      "0x20cab320a855b39f724131c69424240519573f81", // DAI
    ],
    tokenOverrides: [],
    poolsToSkip: [],
    poolMappings: [],
    nativeTokenDetails: {
      symbol: "ETH",
      name: "Ethereum",
      decimals: BigInt(18),
    },
  },
  // soneium-mainnet (startblock 3254740)
  [ChainId.SONEIUM]: {
    factoryAddress: "0x42ae7ec7ff020412639d443e245d936429fbe717",
    stablecoinWrappedNativePoolId: "0xcd4255ceae51803a9333aa1a559991e17b024efc",
    wrappedNativeAddress: "0x4200000000000000000000000000000000000006", // WETH
    minimumNativeLocked: new BigDecimal("1"),
    stablecoinAddresses: [
      "0xba9986d2381edf1da03b0b9c1f8b00dc4aacc369", // USDC
    ],
    whitelistTokens: [
      "0x4200000000000000000000000000000000000006", // WETH
      "0xba9986d2381edf1da03b0b9c1f8b00dc4aacc369", // USDCB
    ],
    tokenOverrides: [],
    poolsToSkip: [],
    poolMappings: [],
    nativeTokenDetails: {
      symbol: "ETH",
      name: "Ethereum",
      decimals: BigInt(18),
    },
  },
  // ink (startblock 284117)
  [ChainId.INK]: {
    factoryAddress: "0x640887a9ba3a9c53ed27d0f7e8246a4f933f3424",
    stablecoinWrappedNativePoolId: "0xd5aa1bd330a94332f071da5bb3651ec372ea6926",
    wrappedNativeAddress: "0x4200000000000000000000000000000000000006", // WETH
    minimumNativeLocked: new BigDecimal("1"),
    stablecoinAddresses: [
      "0xf1815bd50389c46847f0bda824ec8da914045d14", // USDCE
      "0x0200c29006150606b650577bbe7b6248f58470c1", // USDT0
    ],
    whitelistTokens: [
      "0x4200000000000000000000000000000000000006", // WETH
      "0xf1815bd50389c46847f0bda824ec8da914045d14", // USDCE
      "0x0200c29006150606b650577bbe7b6248f58470c1", // USDT0
    ],
    tokenOverrides: [],
    poolsToSkip: [],
    poolMappings: [],
    nativeTokenDetails: {
      symbol: "ETH",
      name: "Ethereum",
      decimals: BigInt(18),
    },
  },
  // linea (startblock 25248)
  [ChainId.LINEA]: {
    factoryAddress: "0x31fafd4889fa1269f7a13a66ee0fb458f27d72a9",
    stablecoinWrappedNativePoolId: "0x93f626d0e471279bd8d1420959cc881bdacfdab1",
    wrappedNativeAddress: "0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f", // WETH
    minimumNativeLocked: new BigDecimal("1"),
    stablecoinAddresses: [
      "0x176211869ca2b568f2a7d4ee941e073a821ee1ff", // USDC
      "0xaca92e438df0b2401ff60da7e4337b687a2435da", // MUSD
      "0xa219439258ca9da29e9cc4ce5596924745e12b93", // USDT
      "0x79a02482a880bce3f13e09da970dc34db4cd24d1", // USDCE
    ],
    whitelistTokens: [
      "0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f", // WETH
      "0x176211869ca2b568f2a7d4ee941e073a821ee1ff", // USDC
      "0xaca92e438df0b2401ff60da7e4337b687a2435da", // MUSD
      "0xa219439258ca9da29e9cc4ce5596924745e12b93", // USDT
      "0x1789e0043623282d5dcc7f213d703c6d8bafbb04", // LINEA
      "0x3aab2285ddcddad8edf438c1bab47e1a9d05a9b4", // WBTC
      "0xe4eeb461ad1e4ef8b8ef71a33694ccd84af051c4", // REX33
      "0xb5bedd42000b71fdde22d3ee8a79bd49a568fc8f", // WSTETH
      "0x2416092f143378750bb29b79ed961ab195cceea5", // EZETH
      "0x1bf74c010e6320bab11e2e5a532b5ac15e0b8aa6", // WEETH
      "0x79a02482a880bce3f13e09da970dc34db4cd24d1", // USDCE
    ],
    tokenOverrides: [],
    poolsToSkip: [],
    poolMappings: [],
    nativeTokenDetails: {
      symbol: "ETH",
      name: "Ethereum",
      decimals: BigInt(18),
    },
  },
  // celo (startblock 13916355)
  [ChainId.CELO]: {
    factoryAddress: "0xafe208a311b21f13ef87e33a90049fc17a7acdec",
    stablecoinWrappedNativePoolId: "0x079e7a44f42e9cd2442c3b9536244be634e8f888",
    wrappedNativeAddress: "0x471ece3750da237f93b8e339c536989b8978a438", // CELO
    minimumNativeLocked: new BigDecimal("3600"),
    stablecoinAddresses: [
      "0x765de816845861e75a25fca122bb6898b8b1282a", // CUSD
      "0xef4229c8c3250c675f21bcefa42f58efbff6002a", // Bridged USDC
      "0xceba9300f2b948710d2653dd7b07f33a8b32118c", // Native USDC
      "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e", // USDT
    ],
    whitelistTokens: [
      "0x471ece3750da237f93b8e339c536989b8978a438", // CELO
      "0x765de816845861e75a25fca122bb6898b8b1282a", // CUSD
      "0xef4229c8c3250c675f21bcefa42f58efbff6002a", // Bridged USDC
      "0xceba9300f2b948710d2653dd7b07f33a8b32118c", // Native USDC
      "0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73", // CEUR
      "0xe8537a3d056da446677b9e9d6c5db704eaab4787", // CREAL
      "0x46c9757c5497c5b1f2eb73ae79b6b67d119b0b58", // PACT
      "0x17700282592d6917f6a73d0bf8accf4d578c131e", // MOO
      "0x66803fb87abd4aac3cbb3fad7c3aa01f6f3fb207", // Portal Eth
      "0xbaab46e28388d2779e6e31fd00cf0e5ad95e327b", // WBTC
      "0xd221812de1bd094f35587ee8e174b07b6167d9af", // WETH
      "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e", // USDT
    ],
    tokenOverrides: [],
    poolsToSkip: [],
    poolMappings: [],
    nativeTokenDetails: {
      symbol: "CELO",
      name: "Celo",
      decimals: BigInt(18),
    },
  },
  // monad (startblock 29255827)
  [ChainId.MONAD]: {
    factoryAddress: "0x204faca1764b154221e35c0d20abb3c525710498",
    stablecoinWrappedNativePoolId: "0x659bd0bc4167ba25c62e05656f78043e7ed4a9da",
    wrappedNativeAddress: "0x3bd359c1119da7da1d913d1c4d2b7c461115433a", // WMON
    minimumNativeLocked: new BigDecimal("100000"),
    stablecoinAddresses: [
      "0x754704bc059f8c67012fed69bc8a327a5aafb603", // USDC
      "0x00000000efe302beaa2b3e6e1b18d08d69a9012a", // AUSD
      "0xe7cd86e13ac4309349f30b3435a9d337750fc82d", // USDT
    ],
    whitelistTokens: [
      "0x3bd359c1119da7da1d913d1c4d2b7c461115433a", // WMON
      "0x754704bc059f8c67012fed69bc8a327a5aafb603", // USDC
      "0x00000000efe302beaa2b3e6e1b18d08d69a9012a", // AUSD
      "0xe7cd86e13ac4309349f30b3435a9d337750fc82d", // USDT
      "0xee8c0e9f1bffb4eb878d8f15f368a02a35481242", // WETH
      "0xea17e5a9efebf1477db45082d67010e2245217f1", // WSOL
    ],
    tokenOverrides: [],
    poolsToSkip: [],
    poolMappings: [],
    nativeTokenDetails: {
      symbol: "MON",
      name: "Monad",
      decimals: BigInt(18),
    },
  },
};

// Helper function to get chain config by chainId
export function getChainConfig(chainId: number): ChainConfig {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new Error(`No configuration found for chain ID ${chainId}`);
  }
  return config;
}
