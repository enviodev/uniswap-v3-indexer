import { safeDiv } from '../src/handlers/utils';
import { isAddressInList } from '../src/handlers/utils/index';
import { ZERO_BD, ZERO_BI, ONE_BD, ADDRESS_ZERO } from '../src/handlers/utils/constants';
import { Bundle, BigDecimal, Token } from "envio";

export function getNativePriceInUSD(
    mockDb: any,
    chainId: number,
    stablecoinWrappedNativePoolId: string,
    stablecoinIsToken0: boolean
): BigDecimal {
    const poolId = `${chainId}-${stablecoinWrappedNativePoolId.toLowerCase()}`;
    const stablecoinWrappedNativePool = mockDb.entities.Pool.get(poolId);

    if (stablecoinWrappedNativePool) {
        return stablecoinIsToken0
        ? stablecoinWrappedNativePool.token0Price
        : stablecoinWrappedNativePool.token1Price;
    }
    return ZERO_BD;
}

export function findNativePerToken(
    mockDb: any,
    token: Token,
    bundle: Bundle,
    wrappedNativeAddress: string,
    stablecoinAddresses: string[],
    minimumNativeLocked: BigDecimal
): BigDecimal {
    const tokenAddress = token.id.split("-")[1];

    if (tokenAddress === wrappedNativeAddress.toLowerCase() || tokenAddress === ADDRESS_ZERO) {
        return ONE_BD;
    }

    if (isAddressInList(tokenAddress, stablecoinAddresses)) {
        return safeDiv(ONE_BD, bundle.ethPriceUSD);
    }

    // Pool IDs already include chainId since we store them that way in whitelistPools
    const whiteList = token.whitelistPools.map(poolId => mockDb.entities.Pool.get(poolId));
    let largestLiquidityETH = ZERO_BD;
    let priceSoFar = ZERO_BD;

    for (const pool of whiteList) {
        if (!pool || pool.liquidity <= ZERO_BI) { continue; }

        if (pool.token0_id === token.id) {
            const token1 = mockDb.entities.Token.get(pool.token1_id);

            if (token1) {
                const ethLocked = pool.totalValueLockedToken1.times(token1.derivedETH);

                if (ethLocked.gt(largestLiquidityETH) && ethLocked.gt(minimumNativeLocked)) {
                    largestLiquidityETH = ethLocked;
                    priceSoFar = pool.token1Price.times(token1.derivedETH);
                }
            }
        }
        
        if (pool.token1_id === token.id) {
            const token0 = mockDb.entities.Token.get(pool.token0_id);
            
            if (token0) {
            const ethLocked = pool.totalValueLockedToken0.times(token0.derivedETH);

                if (ethLocked.gt(largestLiquidityETH) && ethLocked.gt(minimumNativeLocked)) {
                    largestLiquidityETH = ethLocked;
                    priceSoFar = pool.token0Price.times(token0.derivedETH);
                }
            }
        }
    }

    return priceSoFar;
}
