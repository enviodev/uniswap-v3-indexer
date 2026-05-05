import assert from "assert";
import { 
    Bundle, Token, TestHelpers, BigDecimal, Factory, Pool, Swap, 
    UniswapDayData, PoolDayData, PoolHourData, TokenDayData, TokenHourData
} from "envio";
import { convertTokenToDecimal, safeDiv } from '../src/handlers/utils';
import { ZERO_BD } from '../src/handlers/utils/constants';
import {
    getTrackedAmountUSD,
    sqrtPriceX96ToTokenPrices,
} from '../src/handlers/utils/pricing';
import {
    findNativePerToken,
    getNativePriceInUSD
} from './testUtils.test';
import {
    invokePoolCreatedWithMockedEthCalls,
    POOL_FEE_TIER_03,
    TEST_CONFIG,
    TEST_ETH_PRICE_USD,
    TEST_USDC_DERIVED_ETH,
    TEST_WETH_DERIVED_ETH,
    USDC_MAINNET_FIXTURE,
    USDC_WETH_03_MAINNET_POOL,
    WETH_MAINNET_FIXTURE,
    chainId,
    timestamp,
    blockNumber
} from './constants';

const { MockDb, UniswapV3Pool } = TestHelpers;
const logIndex = 1000;
const txFrom = '0xa79d3B28A109F0E3E4919c9715748dB6D88f313f';
const txHash = "0xd6005a794596212a1bdc19178e04e18eb8e9e0963d7073303bcb47d6186e757e";

interface SwapFixture {
    sender: string
    recipient: string
    amount0: bigint
    amount1: bigint
    sqrtPriceX96: bigint
    liquidity: bigint
    tick: bigint
};

// https://etherscan.io/tx/0xd6005a794596212a1bdc19178e04e18eb8e9e0963d7073303bcb47d6186e757e#eventlog
const SWAP_FIXTURE: SwapFixture = {
    sender: '0x6F1cDbBb4d53d226CF4B917bF768B94acbAB6168',
    recipient: '0x6F1cDbBb4d53d226CF4B917bF768B94acbAB6168',
    amount0: -77505140556n,
    amount1: 20824112148200096620n,
    sqrtPriceX96: 1296814378469562426931209291431936n,
    liquidity: 8433670604946078834n,
    tick: 194071n
};

const SWAP_EVENT = UniswapV3Pool.Swap.createMockEvent({
    ...SWAP_FIXTURE,
    mockEventData: {
        srcAddress: USDC_WETH_03_MAINNET_POOL,
        logIndex,
        chainId,
        block: { timestamp, number: blockNumber },
        transaction: {
            gasPrice: 10000000n,
            hash: txHash,
            from: txFrom
        }
    }
});

describe('handleSwap', async () => {
    const poolId = `${chainId}-${USDC_WETH_03_MAINNET_POOL.toLowerCase()}`;
    let mockDb = await invokePoolCreatedWithMockedEthCalls(TEST_CONFIG, MockDb.createMockDb());

    const bundle: Bundle = {
        id: chainId.toString(),
        ethPriceUSD: TEST_ETH_PRICE_USD
    };
    
    mockDb = mockDb.entities.Bundle.set(bundle);

    const token0Id = `${chainId}-${USDC_MAINNET_FIXTURE.address.toLowerCase()}`;
    const usdcEntity: Token = {
        ...mockDb.entities.Token.get(token0Id),
        derivedETH: TEST_USDC_DERIVED_ETH
    };

    mockDb = mockDb.entities.Token.set(usdcEntity);

    const token1Id = `${chainId}-${WETH_MAINNET_FIXTURE.address.toLowerCase()}`;
    const wethEntity: Token = {
        ...mockDb.entities.Token.get(token1Id),
        derivedETH: TEST_WETH_DERIVED_ETH
    };

    mockDb = mockDb.entities.Token.set(wethEntity);

    it('success', async () => {
        const token0 = mockDb.entities.Token.get(token0Id);
        const token1 = mockDb.entities.Token.get(token1Id);

        const amount0 = convertTokenToDecimal(SWAP_FIXTURE.amount0, BigInt(USDC_MAINNET_FIXTURE.decimals));
        const amount1 = convertTokenToDecimal(SWAP_FIXTURE.amount1, BigInt(WETH_MAINNET_FIXTURE.decimals));

        const amount0Abs = amount0.lt(ZERO_BD) ? amount0.times(new BigDecimal('-1')) : amount0;
        const amount1Abs = amount1.lt(ZERO_BD) ? amount1.times(new BigDecimal('-1')) : amount1;

        // calculate this before calling handleSwapHelper because it updates the derivedETH of the tokens which will affect calculations
        const amountTotalUSDTracked = getTrackedAmountUSD(
            bundle,
            amount0Abs,
            token0,
            amount1Abs,
            token1,
            TEST_CONFIG.whitelistTokens,
        ).div(new BigDecimal('2'));

        const amount0ETH = amount0Abs.times(TEST_USDC_DERIVED_ETH);
        const amount1ETH = amount1Abs.times(TEST_WETH_DERIVED_ETH);

        const amount0USD = amount0ETH.times(TEST_ETH_PRICE_USD);
        const amount1USD = amount1ETH.times(TEST_ETH_PRICE_USD);

        const amountTotalETHTRacked = safeDiv(amountTotalUSDTracked, TEST_ETH_PRICE_USD);
        const amountTotalUSDUntracked = amount0USD.plus(amount1USD).div(new BigDecimal('2'));

        const feeTierBD = new BigDecimal(POOL_FEE_TIER_03.toString());
        const feesETH = amountTotalETHTRacked.times(feeTierBD).div(new BigDecimal('1000000'));
        const feesUSD = amountTotalUSDTracked.times(feeTierBD).div(new BigDecimal('1000000'));

        const newMockDb = await UniswapV3Pool.Swap.processEvent({ event: SWAP_EVENT, mockDb });

        const actualBundle = newMockDb.entities.Bundle.get(chainId.toString())!;
        const newEthPrice = actualBundle.ethPriceUSD;
        const newPoolPrices = sqrtPriceX96ToTokenPrices(
            SWAP_FIXTURE.sqrtPriceX96, 
            token0, 
            token1,
            TEST_CONFIG.nativeTokenDetails
        );

        const newToken0DerivedETH = findNativePerToken(
            newMockDb,
            token0,
            actualBundle,
            TEST_CONFIG.wrappedNativeAddress,
            TEST_CONFIG.stablecoinAddresses,
            TEST_CONFIG.minimumNativeLocked,
        );
        const newToken1DerivedETH = findNativePerToken(
            newMockDb,
            token1,
            actualBundle,
            TEST_CONFIG.wrappedNativeAddress,
            TEST_CONFIG.stablecoinAddresses,
            TEST_CONFIG.minimumNativeLocked,
        );
        
        const totalValueLockedETH = amount0.times(newToken0DerivedETH).plus(amount1.times(newToken1DerivedETH));

        const factory: Factory = newMockDb.entities.Factory.get(
            `${chainId}-${TEST_CONFIG.factoryAddress.toLowerCase()}`
        )!;

        assert.deepEqual(factory.txCount, 1n);
        assert.deepEqual(factory.totalVolumeETH.toString(), amountTotalETHTRacked.toString());
        assert.deepEqual(factory.totalVolumeUSD.toString(), amountTotalUSDTracked.toString());
        assert.deepEqual(factory.untrackedVolumeUSD.toString(), amountTotalUSDUntracked.toString());
        assert.deepEqual(factory.totalFeesETH.toString(), feesETH.toString());
        assert.deepEqual(factory.totalFeesUSD.toString(), feesUSD.toString());
        assert.deepEqual(factory.totalValueLockedETH.toString(), totalValueLockedETH.toString());
        assert.deepEqual(factory.totalValueLockedUSD.toString(), totalValueLockedETH.times(newEthPrice).toString());

        const actualPool: Pool = newMockDb.entities.Pool.get(poolId)!;
        assert.deepEqual(actualPool.txCount, 1n);
        assert.deepEqual(actualPool.liquidity, SWAP_FIXTURE.liquidity);
        assert.deepEqual(actualPool.volumeToken0.toString(), amount0Abs.toString());
        assert.deepEqual(actualPool.volumeToken1.toString(), amount1Abs.toString());
        assert.deepEqual(actualPool.volumeUSD.toString(), amountTotalUSDTracked.toString());
        assert.deepEqual(actualPool.untrackedVolumeUSD.toString(), amountTotalUSDUntracked.toString());
        assert.deepEqual(actualPool.feesUSD.toString(), feesUSD.toString());
        assert.deepEqual(actualPool.tick, SWAP_FIXTURE.tick);
        assert.deepEqual(actualPool.sqrtPrice, SWAP_FIXTURE.sqrtPriceX96);
        assert.deepEqual(actualPool.totalValueLockedToken0.toString(), amount0.toString());
        assert.deepEqual(actualPool.totalValueLockedToken1.toString(), amount1.toString());
        assert.deepEqual(actualPool.token0Price.toString(), newPoolPrices[0].toString());
        assert.deepEqual(actualPool.token1Price.toString(), newPoolPrices[1].toString());
        assert.deepEqual(actualPool.totalValueLockedETH.toString(), totalValueLockedETH.toString());
        assert.deepEqual(actualPool.totalValueLockedUSD.toString(), totalValueLockedETH.times(newEthPrice).toString());

        const actualToken0: Token = newMockDb.entities.Token.get(
            `${chainId}-${USDC_MAINNET_FIXTURE.address.toLowerCase()}`
        )!;
        assert.deepEqual(actualToken0.txCount, 1n);
        assert.deepEqual(actualToken0.volume.toString(), amount0Abs.toString());
        assert.deepEqual(actualToken0.volumeUSD.toString(), amountTotalUSDTracked.toString());
        assert.deepEqual(actualToken0.untrackedVolumeUSD.toString(), amountTotalUSDUntracked.toString());
        assert.deepEqual(actualToken0.feesUSD.toString(), feesUSD.toString());
        assert.deepEqual(actualToken0.derivedETH.toString(), newToken0DerivedETH.toString());
        assert.deepEqual(actualToken0.totalValueLocked.toString(), amount0.toString());
        assert.deepEqual(
            actualToken0.totalValueLockedUSD.toString(), 
            amount0.times(newToken0DerivedETH).times(newEthPrice).toString()
        );

        const actualToken1: Token = newMockDb.entities.Token.get(
            `${chainId}-${WETH_MAINNET_FIXTURE.address.toLowerCase()}`
        )!;
        assert.deepEqual(actualToken1.txCount, 1n);
        assert.deepEqual(actualToken1.volume.toString(), amount1Abs.toString());
        assert.deepEqual(actualToken1.volumeUSD.toString(), amountTotalUSDTracked.toString());
        assert.deepEqual(actualToken1.untrackedVolumeUSD.toString(), amountTotalUSDUntracked.toString());
        assert.deepEqual(actualToken1.feesUSD.toString(), feesUSD.toString());
        assert.deepEqual(actualToken1.derivedETH.toString(), newToken1DerivedETH.toString());
        assert.deepEqual(actualToken1.totalValueLocked.toString(), amount1.toString());
        assert.deepEqual(
            actualToken1.totalValueLockedUSD.toString(), 
            amount1.times(newToken1DerivedETH).times(newEthPrice).toString()
        );

        const swap: Swap = newMockDb.entities.Swap.get(`${txHash}-${logIndex}`)!;
        assert.deepEqual(swap.transaction_id, txHash);
        assert.deepEqual(swap.timestamp, timestamp);
        assert.deepEqual(swap.pool_id, poolId);
        assert.deepEqual(swap.token0_id, token0.id);
        assert.deepEqual(swap.token1_id, token1.id);
        assert.deepEqual(swap.sender, SWAP_FIXTURE.sender);
        assert.deepEqual(swap.origin, txFrom.toLowerCase());
        assert.deepEqual(swap.recipient, SWAP_FIXTURE.recipient);
        assert.deepEqual(swap.amount0.toString(), amount0.toString());
        assert.deepEqual(swap.amount1.toString(), amount1.toString());
        assert.deepEqual(swap.amountUSD.toString(), amountTotalUSDTracked.toString());
        assert.deepEqual(swap.tick, SWAP_FIXTURE.tick);
        assert.deepEqual(swap.sqrtPriceX96, SWAP_FIXTURE.sqrtPriceX96);
        assert.deepEqual(swap.logIndex, logIndex);

        const dayId = Math.floor(timestamp / 86400);
        const hourId = Math.floor(timestamp / 3600);

        const uniswapDayData: UniswapDayData = newMockDb.entities.UniswapDayData.get(`${chainId}-${dayId}`)!;
        assert.deepEqual(uniswapDayData.volumeETH.toString(), amountTotalETHTRacked.toString());
        assert.deepEqual(uniswapDayData.volumeUSD.toString(), amountTotalUSDTracked.toString());
        assert.deepEqual(uniswapDayData.feesUSD.toString(), feesUSD.toString());
        
        const poolDayData: PoolDayData = newMockDb.entities.PoolDayData.get(`${poolId}-${dayId}`)!;
        assert.deepEqual(poolDayData.volumeUSD.toString(), amountTotalUSDTracked.toString());
        assert.deepEqual(poolDayData.volumeToken0.toString(), amount0Abs.toString());
        assert.deepEqual(poolDayData.volumeToken1.toString(), amount1Abs.toString());
        assert.deepEqual(poolDayData.feesUSD.toString(), feesUSD.toString());

        const poolHourData: PoolHourData = newMockDb.entities.PoolHourData.get(`${poolId}-${hourId}`)!;
        assert.deepEqual(poolHourData.volumeUSD.toString(), amountTotalUSDTracked.toString());
        assert.deepEqual(poolHourData.volumeToken0.toString(), amount0Abs.toString());
        assert.deepEqual(poolHourData.volumeToken1.toString(), amount1Abs.toString());
        assert.deepEqual(poolHourData.feesUSD.toString(), feesUSD.toString());

        const token0DayData: TokenDayData = newMockDb.entities.TokenDayData.get(`${token0Id}-${dayId}`)!;
        assert.deepEqual(token0DayData.volume.toString(), amount0Abs.toString());
        assert.deepEqual(token0DayData.volumeUSD.toString(), amountTotalUSDTracked.toString());
        assert.deepEqual(token0DayData.untrackedVolumeUSD.toString(), amountTotalUSDTracked.toString());
        assert.deepEqual(token0DayData.feesUSD.toString(), feesUSD.toString());
        
        const token1DayData: TokenDayData = newMockDb.entities.TokenDayData.get(`${token1Id}-${dayId}`)!;
        assert.deepEqual(token1DayData.volume.toString(), amount1Abs.toString());
        assert.deepEqual(token1DayData.volumeUSD.toString(), amountTotalUSDTracked.toString());
        assert.deepEqual(token1DayData.untrackedVolumeUSD.toString(), amountTotalUSDTracked.toString());
        assert.deepEqual(token1DayData.feesUSD.toString(), feesUSD.toString());

        const token0HourData: TokenHourData = newMockDb.entities.TokenHourData.get(`${token0Id}-${hourId}`)!;
        assert.deepEqual(token0HourData.volume.toString(), amount0Abs.toString());
        assert.deepEqual(token0HourData.volumeUSD.toString(), amountTotalUSDTracked.toString());
        assert.deepEqual(token0HourData.untrackedVolumeUSD.toString(), amountTotalUSDTracked.toString());
        assert.deepEqual(token0HourData.feesUSD.toString(), feesUSD.toString());
        
        const token1HourData: TokenHourData = newMockDb.entities.TokenHourData.get(`${token1Id}-${hourId}`)!;
        assert.deepEqual(token1HourData.volume.toString(), amount1Abs.toString());
        assert.deepEqual(token1HourData.volumeUSD.toString(), amountTotalUSDTracked.toString());
        assert.deepEqual(token1HourData.untrackedVolumeUSD.toString(), amountTotalUSDTracked.toString());
        assert.deepEqual(token1HourData.feesUSD.toString(), feesUSD.toString());
    });
});
