import { UniswapV3Pool, Token, Pool, Bundle, Factory } from "generated";
import { CHAIN_CONFIGS } from "./utils/chains";
import { ONE_BI, ZERO_BI } from './utils/constants';
import { convertTokenToDecimal, loadTransaction } from './utils/index';
import { getTrackedAmountUSD } from './utils/pricing';
import * as intervalUpdates from './utils/intervalUpdates';


UniswapV3Pool.Collect.handler(async ({ event, context }) => {
    const poolId = `${event.chainId}-${event.srcAddress.toLowerCase()}`;
    const poolRO = await context.Pool.get(poolId);
    if (!poolRO) return;

    const { factoryAddress } = CHAIN_CONFIGS[event.chainId];
    const [bundle, factoryRO, token0RO, token1RO] = await Promise.all([
        context.Bundle.get(event.chainId.toString()),
        context.Factory.get(`${event.chainId}-${factoryAddress.toLowerCase()}`),
        context.Token.get(poolRO.token0_id),
        context.Token.get(poolRO.token1_id)
    ]);

    if (!bundle || !factoryRO || !token0RO || !token1RO) return;

    const factory = { ...factoryRO };
    const pool = { ...poolRO };
    const token0 = { ...token0RO };
    const token1 = { ...token1RO };
    const { whitelistTokens } = CHAIN_CONFIGS[event.chainId];
    const timestamp = event.block.timestamp;

    // burn entity
    const transaction = await loadTransaction(
        event.transaction.hash,
        event.block.number,
        timestamp,
        event.transaction.gasPrice || ZERO_BI,
        context
    );

    // Get formatted amounts collected.
    const collectedAmountToken0 = convertTokenToDecimal(event.params.amount0, token0.decimals);
    const collectedAmountToken1 = convertTokenToDecimal(event.params.amount1, token1.decimals);
    const trackedCollectedAmountUSD = getTrackedAmountUSD(
        bundle,
        collectedAmountToken0,
        token0 as Token,
        collectedAmountToken1,
        token1 as Token,
        whitelistTokens,
    );

    // Reset tvl aggregates until new amounts calculated
    factory.totalValueLockedETH = factory.totalValueLockedETH.minus(pool.totalValueLockedETH)

    // Update globals
    factory.txCount = factory.txCount + ONE_BI;

    // update token data
    token0.txCount = token0.txCount + ONE_BI;
    token0.totalValueLocked = token0.totalValueLocked.minus(collectedAmountToken0);
    token0.totalValueLockedUSD = token0.totalValueLocked.times(token0.derivedETH.times(bundle.ethPriceUSD));

    token1.txCount = token1.txCount + ONE_BI;
    token1.totalValueLocked = token1.totalValueLocked.minus(collectedAmountToken1);
    token1.totalValueLockedUSD = token1.totalValueLocked.times(token1.derivedETH.times(bundle.ethPriceUSD));

    // Adjust pool TVL based on amount collected.
    pool.txCount = pool.txCount + ONE_BI;
    pool.totalValueLockedToken0 = pool.totalValueLockedToken0.minus(collectedAmountToken0);
    pool.totalValueLockedToken1 = pool.totalValueLockedToken1.minus(collectedAmountToken1);
    pool.totalValueLockedETH = pool.totalValueLockedToken0
        .times(token0.derivedETH)
        .plus(pool.totalValueLockedToken1.times(token1.derivedETH));
    pool.totalValueLockedUSD = pool.totalValueLockedETH.times(bundle.ethPriceUSD);

    // Update aggregate fee collection values.
    pool.collectedFeesToken0 = pool.collectedFeesToken0.plus(collectedAmountToken0);
    pool.collectedFeesToken1 = pool.collectedFeesToken1.plus(collectedAmountToken1);
    pool.collectedFeesUSD = pool.collectedFeesUSD.plus(trackedCollectedAmountUSD);

    // reset aggregates with new amounts
    factory.totalValueLockedETH = factory.totalValueLockedETH.plus(pool.totalValueLockedETH);
    factory.totalValueLockedUSD = factory.totalValueLockedETH.times(bundle.ethPriceUSD);

    const collect = {
        id: `${transaction.id}-${event.logIndex}`,
        transaction_id: transaction.id,
        timestamp: BigInt(timestamp),
        pool_id: pool.id,
        owner: event.params.owner.toLowerCase(),
        amount0: collectedAmountToken0,
        amount1: collectedAmountToken1,
        amountUSD: trackedCollectedAmountUSD,
        tickLower: event.params.tickLower,
        tickUpper: event.params.tickUpper,
        logIndex: BigInt(event.logIndex)
    };

    intervalUpdates.updateUniswapDayData(timestamp, event.chainId, factory, context);
    intervalUpdates.updatePoolDayData(timestamp, pool, context);
    intervalUpdates.updatePoolHourData(timestamp, pool, context);
    intervalUpdates.updateTokenDayData(timestamp, token0, bundle, context);
    intervalUpdates.updateTokenDayData(timestamp, token1, bundle, context);
    intervalUpdates.updateTokenHourData(timestamp, token0, bundle, context);
    intervalUpdates.updateTokenHourData(timestamp, token1, bundle, context);

    context.Token.set(token0);
    context.Token.set(token1);
    context.Pool.set(pool);
    context.Factory.set(factory);
    context.Collect.set(collect);
});
