import { Bundle, Token, Pool, BigDecimal } from "envio";
import { ONE_BD, ZERO_BD, ZERO_BI } from "./constants";
import { exponentToBigDecimal, safeDiv, isAddressInList } from "./index";

const Q192 = BigInt(2) ** BigInt(192);

export function sqrtPriceX96ToTokenPrices(
  sqrtPriceX96: bigint,
  token0: Token,
  token1: Token
): [BigDecimal, BigDecimal] {
  const num = new BigDecimal((sqrtPriceX96 * sqrtPriceX96).toString());
  const denom = new BigDecimal(Q192.toString());
  const price1 = num
    .div(denom)
    .times(exponentToBigDecimal(token0.decimals))
    .div(exponentToBigDecimal(token1.decimals));

  const price0 = safeDiv(new BigDecimal("1"), price1);
  return [price0, price1];
}

export async function getNativePriceInUSD(
  context: any,
  chainId: number,
  stablecoinWrappedNativePoolId: string,
  wrappedNativeAddress: string
): Promise<BigDecimal> {
  // On chains where the reference token is itself a USD stablecoin (e.g. Arc,
  // whose native gas token is USDC and which has no wrapped-native /
  // reference-stable pool), the reference token's USD price is 1 by
  // definition. Such chains opt in by setting stablecoinWrappedNativePoolId =
  // wrappedNativeAddress in their config (mirrors the subgraph's
  // STABLE_TOKEN_POOL = REFERENCE_TOKEN convention).
  if (
    stablecoinWrappedNativePoolId.toLowerCase() ===
    wrappedNativeAddress.toLowerCase()
  ) {
    return ONE_BD;
  }

  const poolId = `${chainId}-${stablecoinWrappedNativePoolId.toLowerCase()}`;
  const stablecoinWrappedNativePool = await context.Pool.get(poolId);

  if (stablecoinWrappedNativePool) {
    // Same dynamic orientation check as the subgraph: if the wrapped native
    // token is token0 the stablecoin side is token1, and vice versa.
    return stablecoinWrappedNativePool.token0_id ===
      `${chainId}-${wrappedNativeAddress.toLowerCase()}`
      ? stablecoinWrappedNativePool.token1Price
      : stablecoinWrappedNativePool.token0Price;
  }
  return ZERO_BD;
}

/**
 * A pool may only set a token's price when the value it implies for the token
 * side is consistent with the pool's verifiable (whitelisted) side.
 *
 * Ported from the v4 indexer where the bound was derived empirically (see its
 * pricing.ts for the full forensics): organically traded one-sided pools sit
 * below ~1000x while every observed poison pool sits at 7.6e3x-1e24x. Without
 * this guard an attacker passes minimumNativeLocked with ~1 ETH of real
 * capital, sets an absurd price with one swap, and freezes a junk derivedETH
 * that inflates TVL/volume USD everywhere the token appears. This is a
 * deliberate, documented deviation from the subgraph (which has no such guard
 * and accumulates junk TVL it periodically hotfixes by hand).
 */
export const MAX_PRICING_POOL_VALUE_IMBALANCE = new BigDecimal("1000");

/**
 * Search through graph to find derived Eth per token.
 * @todo update to be derived ETH (add stablecoin estimates)
 **/
export async function findNativePerToken(
  context: any,
  token: Token,
  bundle: Bundle,
  wrappedNativeAddress: string,
  stablecoinAddresses: string[],
  minimumNativeLocked: BigDecimal
): Promise<BigDecimal> {
  const tokenAddress = token.id.split("-")[1];

  if (tokenAddress === wrappedNativeAddress.toLowerCase()) {
    return ONE_BD;
  }

  if (isAddressInList(tokenAddress, stablecoinAddresses)) {
    return safeDiv(ONE_BD, bundle.ethPriceUSD);
  }

  // for now just take USD from pool with greatest TVL
  // need to update this to actually detect best rate based on liquidity distribution
  let largestLiquidityETH = ZERO_BD;
  let priceSoFar = ZERO_BD;

  // Pool IDs already include chainId since we store them that way in whitelistPools
  const pools = await Promise.all(
    token.whitelistPools.map((poolId) => context.Pool.get(poolId))
  );

  const tokenFetches: {
    pool: Pool;
    tokenId: string;
    isToken0: boolean;
  }[] = [];
  for (const pool of pools) {
    if (pool && pool.liquidity > ZERO_BI) {
      if (pool.token0_id === token.id) {
        // whitelist token is token1
        tokenFetches.push({ pool, tokenId: pool.token1_id, isToken0: false });
      }
      if (pool.token1_id === token.id) {
        // whitelist token is token0
        tokenFetches.push({ pool, tokenId: pool.token0_id, isToken0: true });
      }
    }
  }
  const otherTokens = await Promise.all(
    tokenFetches.map((f) => context.Token.get(f.tokenId))
  );

  for (const [i, { pool, isToken0 }] of tokenFetches.entries()) {
    const otherToken = otherTokens[i];
    if (otherToken) {
      // get the derived ETH in pool: the whitelisted (other) token's side
      const ethLocked = isToken0
        ? pool.totalValueLockedToken0.times(otherToken.derivedETH)
        : pool.totalValueLockedToken1.times(otherToken.derivedETH);
      // other token per our token * ETH per other token
      const candidatePrice = isToken0
        ? pool.token0Price.times(otherToken.derivedETH)
        : pool.token1Price.times(otherToken.derivedETH);
      // Value the candidate price implies for OUR token's side of the pool.
      // Reject prices that value it far beyond the pool's verifiable side —
      // see MAX_PRICING_POOL_VALUE_IMBALANCE.
      const ourSideBalance = isToken0
        ? pool.totalValueLockedToken1
        : pool.totalValueLockedToken0;
      const impliedOurSideETH = ourSideBalance.times(candidatePrice);
      const withinImbalanceBound = impliedOurSideETH.lte(
        ethLocked.times(MAX_PRICING_POOL_VALUE_IMBALANCE)
      );
      if (
        ethLocked.gt(largestLiquidityETH) &&
        ethLocked.gt(minimumNativeLocked) &&
        withinImbalanceBound
      ) {
        largestLiquidityETH = ethLocked;
        priceSoFar = candidatePrice;
      }
    }
  }

  return priceSoFar; // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedAmountUSD(
  bundle: Bundle,
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token,
  whitelistTokens: string[]
): BigDecimal {
  if (!bundle) return ZERO_BD;

  const price0USD = token0.derivedETH.times(bundle.ethPriceUSD);
  const price1USD = token1.derivedETH.times(bundle.ethPriceUSD);

  // Strip chainId prefix from token ids for whitelist comparison
  const token0Address = token0.id.split("-")[1];
  const token1Address = token1.id.split("-")[1];

  const token0IsWhitelisted = isAddressInList(token0Address, whitelistTokens);
  const token1IsWhitelisted = isAddressInList(token1Address, whitelistTokens);

  // both are whitelist tokens, return sum of both amounts
  if (token0IsWhitelisted && token1IsWhitelisted) {
    return tokenAmount0.times(price0USD).plus(tokenAmount1.times(price1USD));
  }

  // take double value of the whitelisted token amount
  if (token0IsWhitelisted && !token1IsWhitelisted) {
    return tokenAmount0.times(price0USD).times(new BigDecimal("2"));
  }

  // take double value of the whitelisted token amount
  if (!token0IsWhitelisted && token1IsWhitelisted) {
    return tokenAmount1.times(price1USD).times(new BigDecimal("2"));
  }

  // neither token is on white list, tracked amount is 0
  return ZERO_BD;
}

export function calculateAmountUSD(
  amount0: BigDecimal,
  amount1: BigDecimal,
  token0DerivedETH: BigDecimal,
  token1DerivedETH: BigDecimal,
  ethPriceUSD: BigDecimal
): BigDecimal {
  return amount0
    .times(token0DerivedETH.times(ethPriceUSD))
    .plus(amount1.times(token1DerivedETH.times(ethPriceUSD)));
}
