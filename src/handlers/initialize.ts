import { UniswapV3Pool, Token, Pool, Bundle } from "generated";
import { CHAIN_CONFIGS } from "./utils/chains";
import { findNativePerToken, getNativePriceInUSD } from "./utils/pricing";
import { updatePoolDayData, updatePoolHourData } from "./utils/intervalUpdates";

UniswapV3Pool.Initialize.handler(async ({event, context}) => {
    const poolId = `${event.chainId}-${event.srcAddress.toLowerCase()}`;
    let pool = await context.Pool.get(poolId);
    if (!pool) return;

    let [bundle, token0, token1] = await Promise.all([
        context.Bundle.get(event.chainId.toString()),
        context.Token.get(pool.token0_id),
        context.Token.get(pool.token1_id)
    ]);

    if (!bundle || !token0 || !token1) return;

    const {
        stablecoinWrappedNativePoolId,
        stablecoinIsToken0,
        wrappedNativeAddress,
        stablecoinAddresses,
        minimumNativeLocked,
    } = CHAIN_CONFIGS[event.chainId];

    // update pool sqrt price and tick
    pool = {
        ...pool,
        sqrtPrice: event.params.sqrtPriceX96,
        tick: event.params.tick
    };
    
    context.Pool.set(pool);

    // update ETH price now that prices could have changed
    bundle = {
        ...bundle,
        ethPriceUSD: await getNativePriceInUSD(
            context, 
            event.chainId, 
            stablecoinWrappedNativePoolId, 
            stablecoinIsToken0
        )
    };

    context.Bundle.set(bundle);

    updatePoolDayData(event.block.timestamp, pool, context);
    updatePoolHourData(event.block.timestamp, pool, context);

    // update token prices
    const [derivedETH_t0, derivedETH_t1] = await Promise.all([
        findNativePerToken(
            context,
            token0,
            bundle,
            wrappedNativeAddress,
            stablecoinAddresses,
            minimumNativeLocked,
        ),
        findNativePerToken(
            context,
            token1,
            bundle,
            wrappedNativeAddress,
            stablecoinAddresses,
            minimumNativeLocked,
        )
    ]);

    token0 = {
        ...token0,
        derivedETH: derivedETH_t0
    };

    token1 = {
        ...token1,
        derivedETH: derivedETH_t1
    };

    context.Token.set(token0);
    context.Token.set(token1);
});
