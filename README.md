# Uniswap V3 Indexer

[![Discord](https://img.shields.io/badge/Discord-Join%20Chat-7289da?logo=discord&logoColor=white)](https://discord.com/invite/envio)

A multichain Uniswap V3 subgraph migration built with [Envio HyperIndex](https://docs.envio.dev/docs/HyperIndex/overview). A 1:1 behavioral port of the [Uniswap V3 Subgraph](https://github.com/Uniswap/v3-subgraph) (`src/v3`) — same entities, same aggregation logic, same pricing algorithm — with multichain support in a single deployment.

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

All chains supported by the Uniswap v3 subgraph that have a HyperSync instance, with the subgraph's exact per-chain constants (factory address, start block, whitelists, stablecoins, minimum native locked, static token definitions, skip lists):

Ethereum, Optimism, Arbitrum One, Base, Polygon, BSC, Avalanche, Blast, Zora, World Chain, Unichain, Soneium, Ink, Linea, Celo, Monad

> Subgraph chains without a proven HyperSync endpoint (zkSync Era, X Layer, Arc, MegaETH, Robinhood, Tempo) are not enabled; add a chain block in `config.yaml` and a `CHAIN_CONFIGS` entry in `src/handlers/utils/chains.ts` once one exists.

### Optimism pre-regenesis pools

Uniswap v3 was live on Optimism before the 2021-11-11 regenesis wiped event history. Like the subgraph (`populateEmptyPools`), the indexer backfills the 103 pre-regenesis pools when the first post-regenesis `PoolCreated` fires: entities are created with liquidity/fee/balances read over archive RPC pinned to that block, and the pool addresses are statically registered in `config.yaml` so their post-regenesis events are indexed.

## Notes on Migration from Subgraph

- All entity IDs that use EVM addresses are stored in lowercase
- IDs are prefixed with the chain ID: `<chainId>-<address>` to avoid cross-chain clashes; `Bundle.id` is the chain ID
- Interval entity IDs follow the subgraph shape with the chain-scoped prefix: `<chainId>-<address>-<periodIndex>` (and `UniswapDayData` is per chain: `<chainId>-<dayIndex>`)
- Token metadata (symbol, name, decimals, totalSupply) is fetched over RPC via the [Effect API](https://docs.envio.dev/docs/HyperIndex/effect-api) with caching, replicating the subgraph's fallbacks: static token definitions first, then `symbol()/name()`, then bytes32 variants; pools whose token decimals cannot be read are never indexed (subgraph parity)
- GraphQL query structure differs from The Graph. See the [query conversion guide](https://docs.envio.dev/docs/HyperIndex/query-conversion)

### Deliberate deviations from the subgraph

Documented differences where the indexer is intentionally *more correct* than the subgraph:

1. **Pricing imbalance guard** (`src/handlers/utils/pricing.ts`): a whitelist pool may only set a token's `derivedETH` when the value it implies for the token side is ≤ 1000× the pool's verifiable (whitelisted) side. This kills the junk-TVL attack class (poison-and-park, trap pools) that the subgraph handles with per-chain manual hotfix lists. Ported from the v4 indexer where the bound was derived empirically.
2. **Higher BigDecimal precision**: division keeps 77 decimal places (graph-node keeps 34 significant digits), and `sanitizeBD` caps stored price-source values at 40 decimal places for Postgres btree index safety.
3. **Interval snapshots see the in-flight event**: the subgraph's interval helpers re-load entities from the store mid-handler and therefore lag the triggering event by one update (e.g. `PoolDayData.tvlUSD` after a swap is the *previous* swap's TVL until the next event). The indexer passes the handler's updated entities, so snapshots are current. Values converge on the next event in the same period.
4. **Extra fields**: `Factory.numberOfSwaps` and `Token.isWhitelisted` (not in the subgraph schema) are kept for convenience.
5. **Vestigial subgraph schema not ported**: the `Flash` entity (subgraph has no Flash handler) and `Transaction.gasUsed` is 0 (same as the subgraph — receipts are not read).

## Prerequisites

- [Node.js](https://nodejs.org/en/download/current) v22 or newer
- [pnpm](https://pnpm.io/installation) v8 or newer
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

## Quick Start

```bash
# Copy environment template and set your HyperSync token + RPC URLs
cp .env.example .env

# Install dependencies
pnpm install

# Run locally (starts indexer + GraphQL API at http://localhost:8080)
pnpm dev
```

The GraphQL Playground is available at [http://localhost:8080](http://localhost:8080). Local password: `testing`.

## Tests

```bash
pnpm test
```

- `test/*.test.ts` — offline unit + handler tests (pricing, interval OHLC, tick math, full Initialize→Mint→Swap→Burn→Collect lifecycle via `createTestIndexer()` with simulated events)
- `src/indexer.test.ts` — E2E replay of pinned mainnet/Optimism history through HyperSync (requires `ENVIO_API_TOKEN` and RPC URLs in `.env`), including the Optimism pre-regenesis backfill

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
# Pool day OHLC
{
  PoolDayData(limit: 7, order_by: {date: desc}, where: {pool_id: {_eq: "1-0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8"}}) {
    date
    open
    high
    low
    close
    volumeUSD
    tvlUSD
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
    totalSupply
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
