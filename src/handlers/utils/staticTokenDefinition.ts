// Initialize a Token Definition with the attributes
export interface StaticTokenDefinition {
  address: string
  symbol: string
  name: string
  decimals: bigint
}

// Search a chain's token overrides (subgraph STATIC_TOKEN_DEFINITIONS) for a
// token address. Addresses in the definitions are lowercase.
export const getStaticDefinition = (
  tokenAddress: string,
  staticDefinitions: Array<StaticTokenDefinition>,
): StaticTokenDefinition | null => {
  const address = tokenAddress.toLowerCase();

  for (const staticDefinition of staticDefinitions) {
    if (staticDefinition.address === address) {
      return staticDefinition;
    }
  }

  // If not found, return null
  return null;
}
