import { indexer, Token } from "envio";
import { CHAIN_CONFIGS } from "./utils/chains";
import { sanitizeBD } from "./utils/index";
import { findNativePerToken, getNativePriceInUSD } from "./utils/pricing";
import { updatePoolDayData, updatePoolHourData } from "./utils/intervalUpdates";

indexer.onEvent({ contract: "UniswapV3Pool", event: "Initialize" }, async ({event, context}) => {
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
        ethPriceUSD: sanitizeBD(await getNativePriceInUSD(
            context,
            event.chainId,
            stablecoinWrappedNativePoolId,
            wrappedNativeAddress
        ))
    };

    context.Bundle.set(bundle);

    // --- DISABLED: day/hour interval aggregates -------------------------
    // Skipped to cut storage and write amplification on the slim sync.
    // Uncomment this block (and any paired context.*.set calls) to restore
    // full 1:1 subgraph parity for the *DayData / *HourData entities.
//     await Promise.all([
//         updatePoolDayData(event.block.timestamp, pool, context),
//         updatePoolHourData(event.block.timestamp, pool, context),
//     ]);

    // update token prices
    const [derivedETH_t0, derivedETH_t1] = await Promise.all([
        findNativePerToken(
            context,
            token0 as Token,
            bundle,
            wrappedNativeAddress,
            stablecoinAddresses,
            minimumNativeLocked,
        ),
        findNativePerToken(
            context,
            token1 as Token,
            bundle,
            wrappedNativeAddress,
            stablecoinAddresses,
            minimumNativeLocked,
        )
    ]);

    token0 = {
        ...token0,
        derivedETH: sanitizeBD(derivedETH_t0)
    };

    token1 = {
        ...token1,
        derivedETH: sanitizeBD(derivedETH_t1)
    };

    context.Token.set(token0);
    context.Token.set(token1);
});
