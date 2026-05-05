import { Bundle, Token, BigDecimal } from "envio";
import { ADDRESS_ZERO, ONE_BD, ZERO_BD, ZERO_BI } from "./constants";
import { exponentToBigDecimal, safeDiv, isAddressInList } from "./index";
import { NativeTokenDetails } from "./nativeTokenDetails";

const Q192 = BigInt(2) ** BigInt(192);

export function sqrtPriceX96ToTokenPrices(
  sqrtPriceX96: bigint,
  token0: Token,
  token1: Token,
  nativeTokenDetails: NativeTokenDetails
): BigDecimal[] {
  const token0Decimals =
    token0.id.split('-')[1] === ADDRESS_ZERO ? nativeTokenDetails.decimals : token0.decimals;
  const token1Decimals =
    token1.id.split('-')[1] === ADDRESS_ZERO ? nativeTokenDetails.decimals : token1.decimals;

  const num = new BigDecimal((sqrtPriceX96 * sqrtPriceX96).toString());
  const denom = new BigDecimal(Q192.toString());
  const price1 = exponentToBigDecimal(token0Decimals).times(num)
                .div(exponentToBigDecimal(token1Decimals).times(denom)).dp(4);
  const price0 = safeDiv(new BigDecimal("1"), price1);
  return [price0, price1];
}

export async function getNativePriceInUSD(
  context: any,
  chainId: number,
  stablecoinWrappedNativePoolId: string,
  stablecoinIsToken0: boolean
): Promise<BigDecimal> {
  const poolId = `${chainId}-${stablecoinWrappedNativePoolId}`;
  const stablecoinWrappedNativePool = await context.Pool.get(poolId);

  if (stablecoinWrappedNativePool) {
    return stablecoinIsToken0
      ? stablecoinWrappedNativePool.token0Price
      : stablecoinWrappedNativePool.token1Price;
  }
  return ZERO_BD;
}

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

  if (tokenAddress === wrappedNativeAddress.toLowerCase() || tokenAddress === ADDRESS_ZERO) {
    return ONE_BD;
  }

  if (isAddressInList(tokenAddress, stablecoinAddresses)) {
    return safeDiv(ONE_BD, bundle.ethPriceUSD);
  }

  const whiteList = await Promise.all(
    // Pool IDs already include chainId since we store them that way in whitelistPools
    token.whitelistPools.map(poolId => context.Pool.get(poolId))
  );
  let largestLiquidityETH = ZERO_BD;
  let priceSoFar = ZERO_BD;

  for (const pool of whiteList) {
    if (!pool || pool.liquidity <= ZERO_BI) { continue; }

    if (pool.token0_id === token.id) {
      const token1 = await context.Token.get(pool.token1_id);

      if (token1) {
        const ethLocked = pool.totalValueLockedToken1.times(token1.derivedETH);

        if (
          ethLocked.gt(largestLiquidityETH) &&
          ethLocked.gt(minimumNativeLocked)
        ) {
          largestLiquidityETH = ethLocked;
          priceSoFar = pool.token1Price.times(token1.derivedETH);
        }
      }
    }

    if (pool.token1_id === token.id) {
      const token0 = await context.Token.get(pool.token0_id);
      
      if (token0) {
        const ethLocked = pool.totalValueLockedToken0.times(token0.derivedETH);

        if (
          ethLocked.gt(largestLiquidityETH) &&
          ethLocked.gt(minimumNativeLocked)
        ) {
          largestLiquidityETH = ethLocked;
          priceSoFar = pool.token0Price.times(token0.derivedETH);
        }
      }
    }
  }

  return priceSoFar;
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