import { UniswapV3Pool, Token, Pool, Bundle, Factory, BigDecimal, Swap } from "generated";
import { CHAIN_CONFIGS } from "./utils/chains";
import { ONE_BI, ZERO_BI, ZERO_BD } from './utils/constants';
import { convertTokenToDecimal, loadTransaction, safeDiv } from './utils/index';
import * as pricing from './utils/pricing';
import * as intervalUpdates from './utils/intervalUpdates';

UniswapV3Pool.Swap.handler(async ({ event, context }) => {
    const {
        factoryAddress,
        stablecoinWrappedNativePoolId,
        stablecoinIsToken0,
        wrappedNativeAddress,
        stablecoinAddresses,
        minimumNativeLocked,
        whitelistTokens,
        nativeTokenDetails
    } = CHAIN_CONFIGS[event.chainId];

    const poolId = `${event.chainId}-${event.srcAddress.toLowerCase()}`;
    const poolRO = await context.Pool.get(poolId);
    if (!poolRO) return;

    const [bundleRO, factoryRO, token0RO, token1RO] = await Promise.all([
        context.Bundle.get(event.chainId.toString()),
        context.Factory.get(`${event.chainId}-${factoryAddress.toLowerCase()}`),
        context.Token.get(poolRO.token0_id),
        context.Token.get(poolRO.token1_id)
    ]);

    if (!bundleRO || !factoryRO || !token0RO || !token1RO) return;

    // Create mutable copies of the entities
    const factory = { ...factoryRO };
    const bundle = { ...bundleRO };
    const token0 = { ...token0RO };
    const token1 = { ...token1RO };
    const pool = { ...poolRO };
    const timestamp = event.block.timestamp;

    // hot fix for bad pricing
    if (pool.id === `${event.chainId}-0x9663f2ca0454accad3e094448ea6f77443880454`) {
        return;
    }

    // amounts - 0/1 are token deltas: can be positive or negative
    const amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals);
    const amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals);

    // need absolute amounts for volume
    const amount0Abs = amount0.lt(ZERO_BD) ? amount0.times(new BigDecimal('-1')) : amount0;
    const amount1Abs = amount1.lt(ZERO_BD) ? amount1.times(new BigDecimal('-1')) : amount1;

    const amount0ETH = amount0Abs.times(token0.derivedETH);
    const amount1ETH = amount1Abs.times(token1.derivedETH);
    const amount0USD = amount0ETH.times(bundle.ethPriceUSD);
    const amount1USD = amount1ETH.times(bundle.ethPriceUSD);

    // get amount that should be tracked only - div 2 because cant count both input and output as volume
    const amountTotalUSDTracked = pricing.getTrackedAmountUSD(
        bundle,
        amount0Abs,
        token0 as Token,
        amount1Abs,
        token1 as Token,
        whitelistTokens,
    ).div(new BigDecimal('2'));

    const amountTotalETHTracked = safeDiv(amountTotalUSDTracked, bundle.ethPriceUSD);
    const amountTotalUSDUntracked = amount0USD.plus(amount1USD).div(new BigDecimal('2'));

    const scaler = new BigDecimal(pool.feeTier.toString()).div(new BigDecimal('1000000'));
    const feesETH = amountTotalETHTracked.times(scaler);
    const feesUSD = amountTotalUSDTracked.times(scaler);

    // global updates
    factory.txCount = factory.txCount + ONE_BI;
    factory.numberOfSwaps = factory.numberOfSwaps + ONE_BI;
    factory.totalVolumeETH = factory.totalVolumeETH.plus(amountTotalETHTracked);
    factory.totalVolumeUSD = factory.totalVolumeUSD.plus(amountTotalUSDTracked);
    factory.untrackedVolumeUSD = factory.untrackedVolumeUSD.plus(amountTotalUSDUntracked);
    factory.totalFeesETH = factory.totalFeesETH.plus(feesETH);
    factory.totalFeesUSD = factory.totalFeesUSD.plus(feesUSD);

    // reset aggregate tvl before individual pool tvl updates
    factory.totalValueLockedETH = factory.totalValueLockedETH.minus(pool.totalValueLockedETH);

    // pool volume
    pool.volumeToken0 = pool.volumeToken0.plus(amount0Abs);
    pool.volumeToken1 = pool.volumeToken1.plus(amount1Abs);
    pool.volumeUSD = pool.volumeUSD.plus(amountTotalUSDTracked);
    pool.untrackedVolumeUSD = pool.untrackedVolumeUSD.plus(amountTotalUSDUntracked);
    pool.feesUSD = pool.feesUSD.plus(feesUSD);
    pool.txCount = pool.txCount + ONE_BI;

    // Update the pool with the new active liquidity, price, and tick.
    pool.liquidity = event.params.liquidity;
    pool.tick = event.params.tick;
    pool.sqrtPrice = event.params.sqrtPriceX96;
    pool.totalValueLockedToken0 = pool.totalValueLockedToken0.plus(amount0);
    pool.totalValueLockedToken1 = pool.totalValueLockedToken1.plus(amount1);

    // update token0 data
    token0.volume = token0.volume.plus(amount0Abs);
    token0.totalValueLocked = token0.totalValueLocked.plus(amount0);
    token0.volumeUSD = token0.volumeUSD.plus(amountTotalUSDTracked);
    token0.untrackedVolumeUSD = token0.untrackedVolumeUSD.plus(amountTotalUSDUntracked);
    token0.feesUSD = token0.feesUSD.plus(feesUSD);
    token0.txCount = token0.txCount + ONE_BI;

    // update token1 data
    token1.volume = token1.volume.plus(amount1Abs);
    token1.totalValueLocked = token1.totalValueLocked.plus(amount1);
    token1.volumeUSD = token1.volumeUSD.plus(amountTotalUSDTracked);
    token1.untrackedVolumeUSD = token1.untrackedVolumeUSD.plus(amountTotalUSDUntracked);
    token1.feesUSD = token1.feesUSD.plus(feesUSD);
    token1.txCount = token1.txCount + ONE_BI;

    // updated pool ratess
    const prices = pricing.sqrtPriceX96ToTokenPrices(pool.sqrtPrice, token0, token1, nativeTokenDetails);
    pool.token0Price = prices[0];
    pool.token1Price = prices[1];
    context.Pool.set(pool);

    // update USD pricing
    bundle.ethPriceUSD = await pricing.getNativePriceInUSD(
        context,
        event.chainId,
        stablecoinWrappedNativePoolId,
        stablecoinIsToken0
    );

    context.Bundle.set(bundle);
    
    token0.derivedETH = await pricing.findNativePerToken(
        context,
        token0,
        bundle,
        wrappedNativeAddress,
        stablecoinAddresses,
        minimumNativeLocked,
    );
    token1.derivedETH = await pricing.findNativePerToken(
        context,
        token1,
        bundle,
        wrappedNativeAddress,
        stablecoinAddresses,
        minimumNativeLocked,
    );

    /**
     * Things afffected by new USD rates
     */
    pool.totalValueLockedETH = pool.totalValueLockedToken0
        .times(token0.derivedETH)
        .plus(pool.totalValueLockedToken1.times(token1.derivedETH));
    pool.totalValueLockedUSD = pool.totalValueLockedETH.times(bundle.ethPriceUSD);

    factory.totalValueLockedETH = factory.totalValueLockedETH.plus(pool.totalValueLockedETH);
    factory.totalValueLockedUSD = factory.totalValueLockedETH.times(bundle.ethPriceUSD);

    token0.totalValueLockedUSD = token0.totalValueLocked.times(token0.derivedETH).times(bundle.ethPriceUSD);
    token1.totalValueLockedUSD = token1.totalValueLocked.times(token1.derivedETH).times(bundle.ethPriceUSD);

    // create Swap event
    const transaction = await loadTransaction(
        event.transaction.hash,
        event.block.number,
        timestamp,
        event.transaction.gasPrice || ZERO_BI,
        context
    );

    const swap: Swap = {
        id: `${transaction.id.toLowerCase()}-${event.logIndex}`,
        transaction_id: transaction.id,
        timestamp: transaction.timestamp,
        pool_id: pool.id,
        token0_id: pool.token0_id,
        token1_id: pool.token1_id,
        sender: event.params.sender,
        origin: event.transaction.from?.toLowerCase() || '',
        recipient: event.params.recipient,
        amount0: amount0,
        amount1: amount1,
        amountUSD: amountTotalUSDTracked,
        tick: event.params.tick,
        sqrtPriceX96: event.params.sqrtPriceX96,
        logIndex: BigInt(event.logIndex)
    };

    // interval data
    const uniswapDayData = { ...await intervalUpdates.updateUniswapDayData(timestamp, event.chainId, factory, context) };
    const poolDayData = { ...await intervalUpdates.updatePoolDayData(timestamp, pool, context) };
    const poolHourData = { ...await intervalUpdates.updatePoolHourData(timestamp, pool, context) };
    const token0DayData = { ...await intervalUpdates.updateTokenDayData(timestamp, token0, bundle, context) };
    const token1DayData = { ...await intervalUpdates.updateTokenDayData(timestamp, token1, bundle, context) };
    const token0HourData = { ...await intervalUpdates.updateTokenHourData(timestamp, token0, bundle, context) };
    const token1HourData = { ...await intervalUpdates.updateTokenHourData(timestamp, token1, bundle, context) };

    // update volume metrics
    uniswapDayData.volumeETH = uniswapDayData.volumeETH.plus(amountTotalETHTracked);
    uniswapDayData.volumeUSD = uniswapDayData.volumeUSD.plus(amountTotalUSDTracked);
    uniswapDayData.feesUSD = uniswapDayData.feesUSD.plus(feesUSD);

    poolDayData.volumeUSD = poolDayData.volumeUSD.plus(amountTotalUSDTracked);
    poolDayData.volumeToken0 = poolDayData.volumeToken0!.plus(amount0Abs);
    poolDayData.volumeToken1 = poolDayData.volumeToken1!.plus(amount1Abs);
    poolDayData.feesUSD = poolDayData.feesUSD!.plus(feesUSD);

    poolHourData.volumeUSD = poolHourData.volumeUSD!.plus(amountTotalUSDTracked);
    poolHourData.volumeToken0 = poolHourData.volumeToken0!.plus(amount0Abs);
    poolHourData.volumeToken1 = poolHourData.volumeToken1!.plus(amount1Abs);
    poolHourData.feesUSD = poolHourData.feesUSD!.plus(feesUSD);

    token0DayData.volume = token0DayData.volume.plus(amount0Abs);
    token0DayData.volumeUSD = token0DayData.volumeUSD.plus(amountTotalUSDTracked);
    token0DayData.untrackedVolumeUSD = token0DayData.untrackedVolumeUSD.plus(amountTotalUSDTracked);
    token0DayData.feesUSD = token0DayData.feesUSD.plus(feesUSD);

    token0HourData.volume = token0HourData.volume.plus(amount0Abs);
    token0HourData.volumeUSD = token0HourData.volumeUSD.plus(amountTotalUSDTracked);
    token0HourData.untrackedVolumeUSD = token0HourData.untrackedVolumeUSD.plus(amountTotalUSDTracked);
    token0HourData.feesUSD = token0HourData.feesUSD.plus(feesUSD);

    token1DayData.volume = token1DayData.volume.plus(amount1Abs);
    token1DayData.volumeUSD = token1DayData.volumeUSD.plus(amountTotalUSDTracked);
    token1DayData.untrackedVolumeUSD = token1DayData.untrackedVolumeUSD.plus(amountTotalUSDTracked);
    token1DayData.feesUSD = token1DayData.feesUSD.plus(feesUSD);

    token1HourData.volume = token1HourData.volume.plus(amount1Abs);
    token1HourData.volumeUSD = token1HourData.volumeUSD.plus(amountTotalUSDTracked);
    token1HourData.untrackedVolumeUSD = token1HourData.untrackedVolumeUSD.plus(amountTotalUSDTracked);
    token1HourData.feesUSD = token1HourData.feesUSD.plus(feesUSD);

    context.Swap.set(swap);
    context.TokenDayData.set(token0DayData);
    context.TokenDayData.set(token1DayData);
    context.UniswapDayData.set(uniswapDayData);
    context.PoolDayData.set(poolDayData);
    context.PoolHourData.set(poolHourData);
    context.TokenHourData.set(token0HourData);
    context.TokenHourData.set(token1HourData);
    context.Factory.set(factory);
    context.Pool.set(pool);
    context.Token.set(token0);
    context.Token.set(token1);
});
