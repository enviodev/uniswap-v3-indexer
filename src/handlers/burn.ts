import { UniswapV3Pool, Token, Pool, Bundle, Factory, Burn, Tick } from "generated";
import { CHAIN_CONFIGS } from "./utils/chains";
import { convertTokenToDecimal, loadTransaction } from './utils/index';
import { ONE_BI, ZERO_BI } from './utils/constants';
import * as intervalUpdates from './utils/intervalUpdates';

UniswapV3Pool.Burn.handler(async ({ event, context }) => {
    const { factoryAddress } = CHAIN_CONFIGS[event.chainId];
    const poolId = `${event.chainId}-${event.srcAddress.toLowerCase()}`;
    
    // tick entities
    const lowerTickId = `${poolId}#${event.params.tickLower}`;
    const upperTickId = `${poolId}#${event.params.tickUpper}`;

    const poolRO = await context.Pool.get(poolId);
    if (!poolRO) return;

    const [bundle, factoryRO, token0RO, token1RO, lowerTickRO, upperTickRO] = await Promise.all([
        context.Bundle.get(event.chainId.toString()),
        context.Factory.get(`${event.chainId}-${factoryAddress.toLowerCase()}`),
        context.Token.get(poolRO.token0_id),
        context.Token.get(poolRO.token1_id),
        context.Tick.get(lowerTickId),
        context.Tick.get(upperTickId),
    ]);

    if (!bundle || !factoryRO || !token0RO || !token1RO) return;

    const factory = { ...factoryRO };
    const pool = { ...poolRO };
    const token0 = { ...token0RO };
    const token1 = { ...token1RO };
    const timestamp = event.block.timestamp;

    const amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals);
    const amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals);

    const amountUSD = amount0
        .times(token0.derivedETH.times(bundle.ethPriceUSD))
        .plus(amount1.times(token1.derivedETH.times(bundle.ethPriceUSD)));

    factory.txCount = factory.txCount + ONE_BI;
    token0.txCount = token0.txCount + ONE_BI;
    token1.txCount = token1.txCount + ONE_BI;
    pool.txCount = pool.txCount + ONE_BI;

    // Pools liquidity tracks the currently active liquidity given pools current tick.
    // We only want to update it on burn if the position being burnt includes the current tick.
    if (
        typeof (pool.tick) === 'bigint' &&
        event.params.tickLower <= pool.tick &&
        event.params.tickUpper > pool.tick
    ) {
        // todo: this liquidity can be calculated from the real reserves and
        // current price instead of incrementally from every burned amount which
        // may not be accurate: https://linear.app/uniswap/issue/DAT-336/fix-pool-liquidity
        pool.liquidity = pool.liquidity - event.params.amount;
    }

    // burn entity
    const transaction = await loadTransaction(
        event.transaction.hash,
        event.block.number,
        timestamp,
        event.transaction.gasPrice || ZERO_BI,
        context
    );

    const burn: Burn = {
        id: `${transaction.id}-${event.logIndex}`,
        transaction_id: transaction.id,
        timestamp: transaction.timestamp,
        pool_id: pool.id,
        token0_id: pool.token0_id,
        token1_id: pool.token1_id,
        owner: event.params.owner,
        origin: event.transaction.from?.toLowerCase() || '',
        amount: event.params.amount,
        amount0: amount0,
        amount1: amount1,
        amountUSD: amountUSD,
        tickLower: BigInt(event.params.tickLower),
        tickUpper: BigInt(event.params.tickUpper),
        logIndex: BigInt(event.logIndex)
    };

    if (lowerTickRO && upperTickRO) {
        const amount = event.params.amount;
        const lowerTick = { ...lowerTickRO };
        const upperTick = { ...upperTickRO };

        lowerTick.liquidityGross = lowerTick.liquidityGross - amount;
        lowerTick.liquidityNet = lowerTick.liquidityNet - amount;
        upperTick.liquidityGross = upperTick.liquidityGross - amount;
        upperTick.liquidityNet = upperTick.liquidityNet - amount;

        context.Tick.set(lowerTick);
        context.Tick.set(upperTick);
    }

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
    context.Burn.set(burn);
});
