# Uniswap V3 Indexer

[![Discord](https://img.shields.io/badge/Discord-Join%20Chat-7289da?logo=discord&logoColor=white)](https://discord.com/invite/envio)

A multichain Uniswap V3 subgraph migration built with [Envio HyperIndex](https://docs.envio.dev/docs/HyperIndex/overview). Migrated from The Graph subgraph to HyperIndex for faster data access and multichain support.

## What's Indexed

The GraphQL API exposes pool statistics, swap history, liquidity positions, fee data, and token metadata across all active chains. You can use this to power analytics dashboards, trading interfaces, liquidity trackers, and cross-chain Uniswap V3 data aggregations.

## Events Indexed

From `UniswapV3Factory` and `UniswapV3Pool` contracts:

- `PoolCreated` - new pool deployments with token pair and fee tier
- `Initialize` - pool initialization with price and tick
- `Mint` - liquidity additions
- `Burn` - liquidity removals
- `Collect` - fee collection
- `Swap` - all swaps with amounts, price, and liquidity

## Active Chains

Ethereum Mainnet, Optimism

> Additional chains (Arbitrum, Base, Polygon, BSC, Avalanche, Blast, Unichain) are available in the config and can be enabled.

## Notes on Migration from Subgraph

- All entity IDs that use EVM addresses are stored in lowercase
- IDs are prefixed with the chain ID: `<chainId>-<address>` to avoid cross-chain clashes
- Unlike the original subgraph, tokens do not have a `totalSupply` field (cannot be updated reliably via events)
- GraphQL query structure differs from The Graph. See the [query conversion guide](https://docs.envio.dev/docs/HyperIndex/query-conversion)

## Prerequisites

- [Node.js](https://nodejs.org/en/download/current) v22 or newer
- [pnpm](https://pnpm.io/installation) v8 or newer
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

## Quick Start

```bash
# Install dependencies
pnpm install

# Run locally (starts indexer + GraphQL API at http://localhost:8080)
pnpm dev
```

The GraphQL Playground is available at [http://localhost:8080](http://localhost:8080). Local password: `testing`.

## Regenerate Files

```bash
pnpm codegen
```

## Sample Queries

```graphql
# Get ETH price
{
  Bundle {
    ethPriceUSD
    id
  }
}
```

```graphql
# Get pools with liquidity
{
  Pool(limit: 10, order_by: {totalValueLockedUSD: desc}) {
    id
    liquidity
    token0 { symbol decimals }
    token1 { symbol decimals }
    totalValueLockedUSD
    volumeUSD
  }
}
```

```graphql
# Get whitelisted tokens
{
  Token(where: {isWhitelisted: {_eq: true}}) {
    id
    name
    symbol
    decimals
    poolCount
  }
}
```

## Built With

- [Envio HyperIndex](https://docs.envio.dev/docs/HyperIndex/overview) - multichain indexing framework
- [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) - high-performance blockchain data retrieval
- Migrated from the [Uniswap V3 Subgraph](https://github.com/Uniswap/v3-subgraph)

## Documentation

- [HyperIndex Docs](https://docs.envio.dev/docs/HyperIndex/overview)
- [Subgraph to HyperIndex query conversion](https://docs.envio.dev/docs/HyperIndex/query-conversion)
- [Migrate from The Graph to Envio](https://docs.envio.dev/docs/HyperIndex/migration-guide)

## Support

- [Discord community](https://discord.com/invite/envio)
- [Envio Docs](https://docs.envio.dev)
