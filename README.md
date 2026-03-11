
# Envio Uniswap V3 Indexer

All the entities in this indexer that use valid evm addresses as their IDs are in lowercase to avoid confusion. They are also prefixed with the chain ID in the form `<chain id>-<address>` to avoid possible id clashes, as this is a multi-chain indexer.

> [!NOTE]
> The GraphQL query structure of Envio and Subgraph has differences. Check this [link](https://docs.envio.dev/docs/HyperIndex/query-conversion) to read more about it. Also, unlike Subgraph, tokens in this indexer doesn't have a `totalSupply` field as it cannot be updated reliably.

## Sample Queries

Envio uses GraphQL as the query language. The below examples demonstrate how to use GraphQL queries to extract data, in simple terms.

#### Basic Query
```graphql
{
  Bundle {
    ethPriceUSD
    id
  }
}
```
What It Does: Fetches all the bundles, showing how you the specified fields `ethPriceUSD` and `id`.

#### Nested Query
```graphql
{
  Pool {
    id
    liquidity
    token0 {
      id
      name
      volume
    }
  }
}
```
What It Does: Fetches pools and their `token0`s in one go, showing how GraphQL handles related data.

#### Query with Filtering
```graphql
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
What It Does: Gets all the whitelisted tokens and their specified fields, illustrating how to filter results based on conditions.

#### Query with Variables
```graphql
query WhitelistedTokens($whitelisted: Boolean) {
  Token(where: {isWhitelisted: {_eq: $whitelisted}}) {
    id
    name
    symbol
    decimals
    poolCount
  }
}
```
What It Does: Lets you dynamically choose values for every possible variables. Here, it's the same example as the previous one, but now you can change the condition through a variable. This `WhitelistedTokens` query can be invoked by providing values in the form `{ "whitelisted": true }`.
___

 These examples should help you see how GraphQL works for different needs. For more details, check out the official documentation at GraphQL Queries or Hasura GraphQL Tutorial.