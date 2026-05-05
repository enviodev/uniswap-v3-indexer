import { ONE_BI, ZERO_BD, ZERO_BI } from './constants';
import {
    Bundle,
    Factory,
    Pool,
    PoolDayData,
    PoolHourData,
    Token,
    TokenDayData,
    TokenHourData,
    UniswapDayData,
} from 'envio';

export async function updateUniswapDayData(
    timestamp: number,
    chainId: number,
    factory: Factory,
    context: any
): Promise<UniswapDayData> {
    const dayNum = Math.floor(timestamp / 86400); // rounded
    const dayStartTimestamp = dayNum * 86400;
    const dayID = `${chainId}-${dayNum}`;
    let uniswapDayDataRO = await context.UniswapDayData.get(dayID);
    let uniswapDayData = uniswapDayDataRO ? {...uniswapDayDataRO} :
                        {
                          id: dayID,
                          date: dayStartTimestamp,
                          volumeETH: ZERO_BD,
                          volumeUSD: ZERO_BD,
                          volumeUSDUntracked: ZERO_BD,
                          feesUSD: ZERO_BD,
                          tvlUSD: ZERO_BD,
                          txCount: ZERO_BI
                        };

    uniswapDayData.tvlUSD = factory.totalValueLockedUSD;
    uniswapDayData.txCount = factory.txCount;

    context.UniswapDayData.set(uniswapDayData);
    return uniswapDayData;
}

export async function updatePoolDayData(
    timestamp: number, 
    pool: Pool, 
    context: any
): Promise<PoolDayData> {
    const dayID = Math.floor(timestamp / 86400);
    const dayStartTimestamp = dayID * 86400;
    const dayPoolID = `${pool.id}-${dayID}`;
    const poolDayDataRO = await context.PoolDayData.get(dayPoolID);
    const poolDayData = poolDayDataRO ? {...poolDayDataRO} :
                      {
                        id: dayPoolID,
                        date: dayStartTimestamp,
                        pool_id: pool.id,
                        // things that dont get initialized always
                        volumeToken0: ZERO_BD,
                        volumeToken1: ZERO_BD,
                        volumeUSD: ZERO_BD,
                        feesUSD: ZERO_BD,
                        txCount: ZERO_BI,
                        openingPrice: pool.token0Price,
                        high: pool.token0Price,
                        low: pool.token0Price,
                        close: pool.token0Price,

                        liquidity: pool.liquidity,
                        sqrtPrice: pool.sqrtPrice,
                        token0Price: pool.token0Price,
                        token1Price: pool.token1Price,
                        tick: pool.tick,
                        tvlUSD: pool.totalValueLockedUSD,
                      };

    if (pool.token0Price.gt(poolDayData.high)) {
        poolDayData.high = pool.token0Price;
    }
    
    if (pool.token0Price.lt(poolDayData.low)) {
        poolDayData.low = pool.token0Price;
    }

    poolDayData.liquidity = pool.liquidity;
    poolDayData.sqrtPrice = pool.sqrtPrice;
    poolDayData.token0Price = pool.token0Price;
    poolDayData.token1Price = pool.token1Price;
    poolDayData.close = pool.token0Price;
    poolDayData.tick = pool.tick;
    poolDayData.tvlUSD = pool.totalValueLockedUSD;
    poolDayData.txCount = poolDayData.txCount + ONE_BI;
    
    context.PoolDayData.set(poolDayData);
    return poolDayData as PoolDayData;
}

export async function updatePoolHourData(
    timestamp: number, 
    pool: Pool,
    context: any
): Promise<PoolHourData> {
    const hourIndex = Math.floor(timestamp / 3600); // get unique hour within unix history
    const hourStartUnix = hourIndex * 3600; // want the rounded effect
    const hourPoolID = `${pool.id}-${hourIndex}`;
    let temp = await context.PoolHourData.get(hourPoolID);

    if (!temp) {
        temp = {
            id: hourPoolID,
            periodStartUnix: hourStartUnix,
            pool_id: pool.id,
            // things that dont get initialized always
            volumeToken0: ZERO_BD,
            volumeToken1: ZERO_BD,
            volumeUSD: ZERO_BD,
            txCount: ZERO_BI,
            feesUSD: ZERO_BD,
            openingPrice: pool.token0Price,
            high: pool.token0Price,
            low: pool.token0Price,
            close: pool.token0Price,

            liquidity: ZERO_BI,
            sqrtPrice: ZERO_BI,
            token0Price: ZERO_BD,
            token1Price: ZERO_BD,
            tick: undefined,
            tvlUSD: ZERO_BD,
        };
    }
    
    const poolHourData = {...temp};

    if (pool.token0Price.gt(poolHourData.high)) {
        poolHourData.high = pool.token0Price;
    }

    if (pool.token0Price.lt(poolHourData.low)) {
        poolHourData.low = pool.token0Price;
    }

    poolHourData.liquidity = pool.liquidity;
    poolHourData.sqrtPrice = pool.sqrtPrice;
    poolHourData.token0Price = pool.token0Price;
    poolHourData.token1Price = pool.token1Price;
    poolHourData.close = pool.token0Price;
    poolHourData.tick = pool.tick;
    poolHourData.tvlUSD = pool.totalValueLockedUSD;
    poolHourData.txCount = poolHourData.txCount + ONE_BI;

    context.PoolHourData.set(poolHourData);
    // test
    return poolHourData as PoolHourData;
}

export async function updateTokenDayData(
    timestamp: number, 
    token: Token, 
    bundle: Bundle,
    context: any
): Promise<TokenDayData> {
    const dayID = Math.floor(timestamp / 86400);
    const dayStartTimestamp = dayID * 86400;
    const tokenDayID = `${token.id}-${dayID}`;
    const tokenPrice = token.derivedETH.times(bundle.ethPriceUSD);
    const tokenDayDataRO = await context.TokenDayData.get(tokenDayID);

    let tokenDayData = tokenDayDataRO ? {...tokenDayDataRO} :
                        {
                            id: tokenDayID,
                            date: dayStartTimestamp,
                            token_id: token.id,
                            volume: ZERO_BD,
                            volumeUSD: ZERO_BD,
                            feesUSD: ZERO_BD,
                            untrackedVolumeUSD: ZERO_BD,
                            open: tokenPrice,
                            high: tokenPrice,
                            low: tokenPrice,
                            close: tokenPrice,
                            priceUSD: ZERO_BD,
                            openingPrice: ZERO_BD,
                            totalValueLocked: ZERO_BD,
                            totalValueLockedUSD: ZERO_BD
                        };

    if (tokenPrice.gt(tokenDayData.high)) {
        tokenDayData.high = tokenPrice;
    }

    if (tokenPrice.lt(tokenDayData.low)) {
        tokenDayData.low = tokenPrice;
    }

    tokenDayData.close = tokenPrice;
    tokenDayData.priceUSD = token.derivedETH.times(bundle.ethPriceUSD);
    tokenDayData.totalValueLocked = token.totalValueLocked;
    tokenDayData.totalValueLockedUSD = token.totalValueLockedUSD;

    context.TokenDayData.set(tokenDayData);
    return tokenDayData as TokenDayData;
}

export async function updateTokenHourData(
    timestamp: number,
    token: Token,
    bundle: Bundle,
    context: any
): Promise<TokenHourData> {
    const hourIndex = Math.floor(timestamp / 3600); // get unique hour within unix history
    const hourStartUnix = hourIndex * 3600; // want the rounded effect
    const tokenPrice = token.derivedETH.times(bundle.ethPriceUSD);
    const tokenHourID = `${token.id}-${hourIndex}`;
    const tokenHourDataRO = await context.TokenHourData.get(tokenHourID);
    const tokenHourData = tokenHourDataRO ? {...tokenHourDataRO} :
                        {
                          id: tokenHourID,
                          periodStartUnix: hourStartUnix,
                          token_id: token.id,
                          volume: ZERO_BD,
                          volumeUSD: ZERO_BD,
                          untrackedVolumeUSD: ZERO_BD,
                          feesUSD: ZERO_BD,
                          open: tokenPrice,
                          high: tokenPrice,
                          low: tokenPrice,
                          close: tokenPrice,
                          priceUSD: ZERO_BD,
                          openingPrice: ZERO_BD,
                          totalValueLocked: ZERO_BD,
                          totalValueLockedUSD: ZERO_BD
                        };

    if (tokenPrice.gt(tokenHourData.high)) {
        tokenHourData.high = tokenPrice;
    }

    if (tokenPrice.lt(tokenHourData.low)) {
        tokenHourData.low = tokenPrice;
    }

    tokenHourData.close = tokenPrice;
    tokenHourData.priceUSD = tokenPrice;
    tokenHourData.totalValueLocked = token.totalValueLocked;
    tokenHourData.totalValueLockedUSD = token.totalValueLockedUSD;

    context.TokenHourData.set(tokenHourData);
    return tokenHourData as TokenHourData;
}
