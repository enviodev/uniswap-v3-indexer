import { UniswapV3Pool, Token, Pool, Bundle } from "generated";
import { CHAIN_CONFIGS } from "./utils/chains";
import { findNativePerToken, getNativePriceInUSD } from "./utils/pricing";
import { updatePoolDayData, updatePoolHourData } from "./utils/intervalUpdates";

UniswapV3Pool.Initialize.handler(async ({ event, context }) => {
    const poolId = `${event.chainId}-${event.srcAddress.toLowerCase()}`;
    const pool = await context.Pool.get(poolId);
    if (!pool) return;

    const [bundleRO, token0RO, token1RO] = await Promise.all([
        context.Bundle.get(event.chainId.toString()),
        context.Token.get(pool.token0_id),
        context.Token.get(pool.token1_id)
    ]);

    if (!bundleRO || !token0RO || !token1RO) return;

    const {
        stablecoinWrappedNativePoolId,
        stablecoinIsToken0,
        wrappedNativeAddress,
        stablecoinAddresses,
        minimumNativeLocked,
    } = CHAIN_CONFIGS[event.chainId];

    // update pool sqrt price and tick
    let updatedPool: Pool = {
        ...pool,
        sqrtPrice: event.params.sqrtPriceX96,
        tick: event.params.tick
    };

    context.Pool.set(updatedPool);

    // update ETH price now that prices could have changed
    let bundle: Bundle = {
        ...bundleRO,
        ethPriceUSD: await getNativePriceInUSD(
            context,
            event.chainId,
            stablecoinWrappedNativePoolId,
            stablecoinIsToken0
        )
    };

    context.Bundle.set(bundle);

    updatePoolDayData(event.block.timestamp, updatedPool, context);
    updatePoolHourData(event.block.timestamp, updatedPool, context);

    // update token prices
    const [derivedETH_t0, derivedETH_t1] = await Promise.all([
        findNativePerToken(
            context,
            token0RO,
            bundle,
            wrappedNativeAddress,
            stablecoinAddresses,
            minimumNativeLocked,
        ),
        findNativePerToken(
            context,
            token1RO,
            bundle,
            wrappedNativeAddress,
            stablecoinAddresses,
            minimumNativeLocked,
        )
    ]);

    const token0: Token = {
        ...token0RO,
        derivedETH: derivedETH_t0
    };

    const token1: Token = {
        ...token1RO,
        derivedETH: derivedETH_t1
    };

    context.Token.set(token0);
    context.Token.set(token1);
});
