import assert from "assert";
import { 
    Bundle, Factory, Pool, Token, TestHelpers, BigDecimal,
    UniswapDayData, PoolDayData, PoolHourData, TokenDayData, TokenHourData
} from "envio";
import { ADDRESS_ZERO, ZERO_BD, ZERO_BI } from '../src/handlers/utils/constants';
import {
    updatePoolDayData,
    updatePoolHourData,
    updateTokenDayData,
    updateTokenHourData,
    updateUniswapDayData,
} from './intervalUpdatesFuncsForTesting';
import {
    createAndStoreTestPool,
    createAndStoreTestToken,
    TEST_CONFIG,
    TEST_ETH_PRICE_USD,
    USDC_WETH_03_MAINNET_POOL,
    USDC_WETH_03_MAINNET_POOL_FIXTURE,
    WETH_MAINNET_FIXTURE,
    chainId,
    timestamp
} from './constants';

const { MockDb } = TestHelpers;

describe('uniswap interval data', () => {
    const factoryId = `${chainId}-${TEST_CONFIG.factoryAddress.toLowerCase()}`;
    const factory: Factory = {
        id: factoryId,
        poolCount: ZERO_BI,
        numberOfSwaps: ZERO_BI,
        totalVolumeUSD: ZERO_BD,
        totalVolumeETH: ZERO_BD,
        totalFeesUSD: ZERO_BD,
        totalFeesETH: ZERO_BD,
        untrackedVolumeUSD: ZERO_BD,
        totalValueLockedUSDUntracked: ZERO_BD,
        totalValueLockedETHUntracked: ZERO_BD,
        totalValueLockedETH: ZERO_BD,
        txCount: ZERO_BI,
        totalValueLockedUSD: ZERO_BD,
        owner: ADDRESS_ZERO
    };

    const mockDb = MockDb.createMockDb().entities.Factory.set(factory);

    it('success - create and update uniswapDayData', () => {
        // these are the only two fields that get persisted to uniswapDayData, set them to non-zero values
        const uniswapTxCount = 10n;
        const uniswapTotalValueLockedUSD = new BigDecimal('100');
        const factory = {
            ...mockDb.entities.Factory.get(factoryId)!,
            txCount: uniswapTxCount,
            totalValueLockedUSD: uniswapTotalValueLockedUSD
        };

        let newMockDb = mockDb.entities.Factory.set(factory);
        newMockDb = updateUniswapDayData(timestamp, chainId, factory, newMockDb);

        const dayNum = Math.floor(timestamp / 86400);
        const dayStartTimestamp = dayNum * 86400;
        const dayId = `${chainId}-${dayNum}`;

        let uniswapDayData: UniswapDayData = newMockDb.entities.UniswapDayData.get(dayId)!;
        assert.deepEqual(uniswapDayData.date, dayStartTimestamp);
        assert.deepEqual(uniswapDayData.volumeETH.toString(), '0');
        assert.deepEqual(uniswapDayData.volumeUSD.toString(), '0');
        assert.deepEqual(uniswapDayData.volumeUSDUntracked.toString(), '0');
        assert.deepEqual(uniswapDayData.feesUSD.toString(), '0');
        assert.deepEqual(uniswapDayData.tvlUSD.toString(), uniswapTotalValueLockedUSD.toString());
        assert.deepEqual(uniswapDayData.txCount, uniswapTxCount);

        const updatedTxCount = 20n;
        factory.txCount = updatedTxCount;
        newMockDb = newMockDb.entities.Factory.set(factory);
        newMockDb = updateUniswapDayData(
            timestamp, 
            chainId, 
            newMockDb.entities.Factory.get(factoryId)!, 
            newMockDb
        );

        uniswapDayData = newMockDb.entities.UniswapDayData.get(dayId)!;
        assert.deepEqual(uniswapDayData.txCount, updatedTxCount);
    });
});

describe('pool interval data', () => {
    const poolId = `${chainId}-${USDC_WETH_03_MAINNET_POOL.toLowerCase()}`;
    const mockDb = createAndStoreTestPool(
        USDC_WETH_03_MAINNET_POOL_FIXTURE, 
        chainId, 
        MockDb.createMockDb()
    )[1];

    it('success - create and update poolDayData', () => {
        const pool = {
            ...mockDb.entities.Pool.get(poolId),
            token0Price: new BigDecimal('1'),
            token1Price: new BigDecimal('2'),
            liquidity: 100n,
            sqrtPrice: 200n,
            tick: 300n,
            totalValueLockedUSD: new BigDecimal('1000')
        };

        let newMockDb = mockDb.entities.Pool.set(pool);
        newMockDb = updatePoolDayData(timestamp, pool, newMockDb);

        const dayId = Math.floor(timestamp / 86400);
        const dayStartTimestamp = dayId * 86400;
        const dayPoolID = `${poolId}-${dayId}`;
        let poolDayData: PoolDayData = newMockDb.entities.PoolDayData.get(dayPoolID);

        assert.deepEqual(poolDayData.date, dayStartTimestamp);
        assert.deepEqual(poolDayData.pool_id, poolId);
        assert.deepEqual(poolDayData.volumeToken0.toString(), '0');
        assert.deepEqual(poolDayData.volumeToken1.toString(), '0');
        assert.deepEqual(poolDayData.volumeUSD.toString(), '0');
        assert.deepEqual(poolDayData.feesUSD.toString(), '0');
        assert.deepEqual(poolDayData.txCount, 1n);
        assert.deepEqual(poolDayData.openingPrice.toString(), '1');
        assert.deepEqual(poolDayData.high.toString(), '1');
        assert.deepEqual(poolDayData.low.toString(), '1');
        assert.deepEqual(poolDayData.close.toString(), '1');
        assert.deepEqual(poolDayData.token0Price.toString(), '1');
        assert.deepEqual(poolDayData.token1Price.toString(), '2');
        assert.deepEqual(poolDayData.liquidity, 100n);
        assert.deepEqual(poolDayData.sqrtPrice, 200n);
        assert.deepEqual(poolDayData.tick, 300n);
        assert.deepEqual(poolDayData.tvlUSD.toString(), '1000');

        // update the high price
        pool.token0Price = new BigDecimal('2');
        newMockDb = newMockDb.entities.Pool.set(pool);
        newMockDb = updatePoolDayData(timestamp, pool, newMockDb);
        poolDayData = newMockDb.entities.PoolDayData.get(dayPoolID);

        assert.deepEqual(poolDayData.date, dayStartTimestamp);
        assert.deepEqual(poolDayData.pool_id, poolId);
        assert.deepEqual(poolDayData.volumeToken0.toString(), '0');
        assert.deepEqual(poolDayData.volumeToken1.toString(), '0');
        assert.deepEqual(poolDayData.volumeUSD.toString(), '0');
        assert.deepEqual(poolDayData.feesUSD.toString(), '0');
        assert.deepEqual(poolDayData.txCount, 2n);
        assert.deepEqual(poolDayData.openingPrice.toString(), '1');
        assert.deepEqual(poolDayData.high.toString(), '2');
        assert.deepEqual(poolDayData.low.toString(), '1');
        assert.deepEqual(poolDayData.close.toString(), '2');
        assert.deepEqual(poolDayData.token0Price.toString(), '2');
        assert.deepEqual(poolDayData.token1Price.toString(), '2');
        assert.deepEqual(poolDayData.liquidity, 100n);
        assert.deepEqual(poolDayData.sqrtPrice, 200n);
        assert.deepEqual(poolDayData.tick, 300n);
        assert.deepEqual(poolDayData.tvlUSD.toString(), '1000');

        // update the low price
        pool.token0Price = new BigDecimal('0');
        newMockDb = newMockDb.entities.Pool.set(pool);
        newMockDb = updatePoolDayData(timestamp, pool, newMockDb);
        poolDayData = newMockDb.entities.PoolDayData.get(dayPoolID);

        assert.deepEqual(poolDayData.date, dayStartTimestamp);
        assert.deepEqual(poolDayData.pool_id, poolId);
        assert.deepEqual(poolDayData.volumeToken0.toString(), '0');
        assert.deepEqual(poolDayData.volumeToken1.toString(), '0');
        assert.deepEqual(poolDayData.volumeUSD.toString(), '0');
        assert.deepEqual(poolDayData.feesUSD.toString(), '0');
        assert.deepEqual(poolDayData.txCount, 3n);
        assert.deepEqual(poolDayData.openingPrice.toString(), '1');
        assert.deepEqual(poolDayData.high.toString(), '2');
        assert.deepEqual(poolDayData.low.toString(), '0');
        assert.deepEqual(poolDayData.close.toString(), '0');
        assert.deepEqual(poolDayData.token0Price.toString(), '0');
        assert.deepEqual(poolDayData.token1Price.toString(), '2');
        assert.deepEqual(poolDayData.liquidity, 100n);
        assert.deepEqual(poolDayData.sqrtPrice, 200n);
        assert.deepEqual(poolDayData.tick, 300n);
        assert.deepEqual(poolDayData.tvlUSD.toString(), '1000');
    });

    it('success - create and update poolHourData', () => {
        const pool = {
            ...mockDb.entities.Pool.get(poolId),
            token0Price: new BigDecimal('1'),
            token1Price: new BigDecimal('2'),
            liquidity: 100n,
            sqrtPrice: 200n,
            tick: 300n,
            totalValueLockedUSD: new BigDecimal('1000')
        };

        let newMockDb = mockDb.entities.Pool.set(pool);
        newMockDb = updatePoolHourData(timestamp, pool, newMockDb);

        const hourIndex = Math.floor(timestamp / 3600);
        const hourStartUnix = hourIndex * 3600;
        const hourPoolID = `${poolId}-${hourIndex}`;
        let poolHourData: PoolHourData = newMockDb.entities.PoolHourData.get(hourPoolID);

        assert.deepEqual(poolHourData.periodStartUnix, hourStartUnix);
        assert.deepEqual(poolHourData.pool_id, poolId);
        assert.deepEqual(poolHourData.volumeToken0.toString(), '0');
        assert.deepEqual(poolHourData.volumeToken1.toString(), '0');
        assert.deepEqual(poolHourData.volumeUSD.toString(), '0');
        assert.deepEqual(poolHourData.feesUSD.toString(), '0');
        assert.deepEqual(poolHourData.txCount, 1n);
        assert.deepEqual(poolHourData.openingPrice.toString(), '1');
        assert.deepEqual(poolHourData.high.toString(), '1');
        assert.deepEqual(poolHourData.low.toString(), '1');
        assert.deepEqual(poolHourData.close.toString(), '1');
        assert.deepEqual(poolHourData.token0Price.toString(), '1');
        assert.deepEqual(poolHourData.token1Price.toString(), '2');
        assert.deepEqual(poolHourData.liquidity, 100n);
        assert.deepEqual(poolHourData.sqrtPrice, 200n);
        assert.deepEqual(poolHourData.tick, 300n);
        assert.deepEqual(poolHourData.tvlUSD.toString(), '1000');

        // update the high price
        pool.token0Price = new BigDecimal('2');
        newMockDb = newMockDb.entities.Pool.set(pool);
        newMockDb = updatePoolHourData(timestamp, pool, newMockDb);
        poolHourData = newMockDb.entities.PoolHourData.get(hourPoolID);

        assert.deepEqual(poolHourData.periodStartUnix, hourStartUnix);
        assert.deepEqual(poolHourData.pool_id, poolId);
        assert.deepEqual(poolHourData.volumeToken0.toString(), '0');
        assert.deepEqual(poolHourData.volumeToken1.toString(), '0');
        assert.deepEqual(poolHourData.volumeUSD.toString(), '0');
        assert.deepEqual(poolHourData.feesUSD.toString(), '0');
        assert.deepEqual(poolHourData.txCount, 2n);
        assert.deepEqual(poolHourData.openingPrice.toString(), '1');
        assert.deepEqual(poolHourData.high.toString(), '2');
        assert.deepEqual(poolHourData.low.toString(), '1');
        assert.deepEqual(poolHourData.close.toString(), '2');
        assert.deepEqual(poolHourData.token0Price.toString(), '2');
        assert.deepEqual(poolHourData.token1Price.toString(), '2');
        assert.deepEqual(poolHourData.liquidity, 100n);
        assert.deepEqual(poolHourData.sqrtPrice, 200n);
        assert.deepEqual(poolHourData.tick, 300n);
        assert.deepEqual(poolHourData.tvlUSD.toString(), '1000');

        // update the low price
        pool.token0Price = new BigDecimal('0');
        newMockDb = newMockDb.entities.Pool.set(pool);
        newMockDb = updatePoolHourData(timestamp, pool, newMockDb);
        poolHourData = newMockDb.entities.PoolHourData.get(hourPoolID);

        assert.deepEqual(poolHourData.periodStartUnix, hourStartUnix);
        assert.deepEqual(poolHourData.pool_id, poolId);
        assert.deepEqual(poolHourData.volumeToken0.toString(), '0');
        assert.deepEqual(poolHourData.volumeToken1.toString(), '0');
        assert.deepEqual(poolHourData.volumeUSD.toString(), '0');
        assert.deepEqual(poolHourData.feesUSD.toString(), '0');
        assert.deepEqual(poolHourData.txCount, 3n);
        assert.deepEqual(poolHourData.openingPrice.toString(), '1');
        assert.deepEqual(poolHourData.high.toString(), '2');
        assert.deepEqual(poolHourData.low.toString(), '0');
        assert.deepEqual(poolHourData.close.toString(), '0');
        assert.deepEqual(poolHourData.token0Price.toString(), '0');
        assert.deepEqual(poolHourData.token1Price.toString(), '2');
        assert.deepEqual(poolHourData.liquidity, 100n);
        assert.deepEqual(poolHourData.sqrtPrice, 200n);
        assert.deepEqual(poolHourData.tick, 300n);
        assert.deepEqual(poolHourData.tvlUSD.toString(), '1000');
    });
});

describe('token interval data', () => {
    const tokenId = `${chainId}-${WETH_MAINNET_FIXTURE.address.toLowerCase()}`;
    let mockDb = createAndStoreTestToken(
        WETH_MAINNET_FIXTURE,
        chainId,
        MockDb.createMockDb()
    )[1];

    const bundle: Bundle = {
        id: chainId.toString(),
        ethPriceUSD: ZERO_BD
    };

    mockDb = mockDb.entities.Bundle.set(bundle);

    it('success - create and update tokenDayData', () => {
        const token = {
            ...mockDb.entities.Token.get(tokenId),
            derivedETH: new BigDecimal('1'),
            totalValueLocked: new BigDecimal('100'),
            totalValueLockedUSD: new BigDecimal('1000')
        };

        let newMockDb = mockDb.entities.Token.set(token);

        const bundle = {
            ...newMockDb.entities.Bundle.get(chainId.toString()),
            ethPriceUSD: TEST_ETH_PRICE_USD
        };

        newMockDb = newMockDb.entities.Bundle.set(bundle);
        newMockDb = updateTokenDayData(timestamp, token, bundle, newMockDb);

        const dayId = Math.floor(timestamp / 86400);
        const dayStartTimestamp = dayId * 86400;
        const tokenDayID = `${tokenId}-${dayId}`;
        let tokenDayData: TokenDayData = newMockDb.entities.TokenDayData.get(tokenDayID);

        assert.deepEqual(tokenDayData.date, dayStartTimestamp);
        assert.deepEqual(tokenDayData.token_id, tokenId);
        assert.deepEqual(tokenDayData.volume.toString(), '0');
        assert.deepEqual(tokenDayData.volumeUSD.toString(), '0');
        assert.deepEqual(tokenDayData.feesUSD.toString(), '0');
        assert.deepEqual(tokenDayData.untrackedVolumeUSD.toString(), '0');
        // assert.deepEqual(tokenDayData.openingPrice.toString(), TEST_ETH_PRICE_USD.toString());
        assert.deepEqual(tokenDayData.high.toString(), TEST_ETH_PRICE_USD.toString());
        assert.deepEqual(tokenDayData.low.toString(), TEST_ETH_PRICE_USD.toString());
        assert.deepEqual(tokenDayData.close.toString(), TEST_ETH_PRICE_USD.toString());
        assert.deepEqual(tokenDayData.priceUSD.toString(), TEST_ETH_PRICE_USD.toString());
        assert.deepEqual(tokenDayData.totalValueLocked.toString(), '100');
        assert.deepEqual(tokenDayData.totalValueLockedUSD.toString(), '1000');

        // update the high price
        token.derivedETH = new BigDecimal('2');
        newMockDb = newMockDb.entities.Token.set(token);
        newMockDb = updateTokenDayData(timestamp, token, bundle, newMockDb);
        const highPriceStr = TEST_ETH_PRICE_USD.times(new BigDecimal('2')).toString();
        tokenDayData = newMockDb.entities.TokenDayData.get(tokenDayID);

        assert.deepEqual(tokenDayData.date, dayStartTimestamp);
        assert.deepEqual(tokenDayData.token_id, tokenId);
        assert.deepEqual(tokenDayData.volume.toString(), '0');
        assert.deepEqual(tokenDayData.volumeUSD.toString(), '0');
        assert.deepEqual(tokenDayData.feesUSD.toString(), '0');
        assert.deepEqual(tokenDayData.untrackedVolumeUSD.toString(), '0');
        // assert.deepEqual(tokenDayData.openingPrice.toString(), TEST_ETH_PRICE_USD.toString());
        assert.deepEqual(tokenDayData.high.toString(), highPriceStr);
        assert.deepEqual(tokenDayData.low.toString(), TEST_ETH_PRICE_USD.toString());
        assert.deepEqual(tokenDayData.close.toString(), highPriceStr);
        assert.deepEqual(tokenDayData.priceUSD.toString(), highPriceStr);
        assert.deepEqual(tokenDayData.totalValueLocked.toString(), '100');
        assert.deepEqual(tokenDayData.totalValueLockedUSD.toString(), '1000');

        // update the low price
        token.derivedETH = ZERO_BD;
        newMockDb = newMockDb.entities.Token.set(token);
        newMockDb = updateTokenDayData(timestamp, token, bundle, newMockDb);
        const lowPriceStr = ZERO_BD.toString();
        tokenDayData = newMockDb.entities.TokenDayData.get(tokenDayID);

        assert.deepEqual(tokenDayData.date, dayStartTimestamp);
        assert.deepEqual(tokenDayData.token_id, tokenId);
        assert.deepEqual(tokenDayData.volume.toString(), '0');
        assert.deepEqual(tokenDayData.volumeUSD.toString(), '0');
        assert.deepEqual(tokenDayData.feesUSD.toString(), '0');
        assert.deepEqual(tokenDayData.untrackedVolumeUSD.toString(), '0');
        // assert.deepEqual(tokenDayData.openingPrice.toString(), TEST_ETH_PRICE_USD.toString());
        assert.deepEqual(tokenDayData.high.toString(), highPriceStr);
        assert.deepEqual(tokenDayData.low.toString(), lowPriceStr);
        assert.deepEqual(tokenDayData.close.toString(), lowPriceStr);
        assert.deepEqual(tokenDayData.priceUSD.toString(), lowPriceStr);
        assert.deepEqual(tokenDayData.totalValueLocked.toString(), '100');
        assert.deepEqual(tokenDayData.totalValueLockedUSD.toString(), '1000');
    });

    it('success - create and update tokenHourData', () => {
        const token = {
            ...mockDb.entities.Token.get(tokenId),
            derivedETH: new BigDecimal('1'),
            totalValueLocked: new BigDecimal('100'),
            totalValueLockedUSD: new BigDecimal('1000')
        };

        let newMockDb = mockDb.entities.Token.set(token);

        const bundle = {
            ...newMockDb.entities.Bundle.get(chainId.toString()),
            ethPriceUSD: TEST_ETH_PRICE_USD
        };

        newMockDb = newMockDb.entities.Bundle.set(bundle);
        newMockDb = updateTokenHourData(timestamp, token, bundle, newMockDb);

        const hourIndex = Math.floor(timestamp / 3600);
        const hourStartUnix = hourIndex * 3600;
        const tokenHourID = `${tokenId}-${hourIndex}`;
        let tokenHourData: TokenHourData = newMockDb.entities.TokenHourData.get(tokenHourID);

        assert.deepEqual(tokenHourData.periodStartUnix, hourStartUnix);
        assert.deepEqual(tokenHourData.token_id, tokenId);
        assert.deepEqual(tokenHourData.volume.toString(), '0');
        assert.deepEqual(tokenHourData.volumeUSD.toString(), '0');
        assert.deepEqual(tokenHourData.feesUSD.toString(), '0');
        assert.deepEqual(tokenHourData.untrackedVolumeUSD.toString(), '0');
        // assert.deepEqual(tokenHourData.openingPrice.toString(), TEST_ETH_PRICE_USD.toString());
        assert.deepEqual(tokenHourData.high.toString(), TEST_ETH_PRICE_USD.toString());
        assert.deepEqual(tokenHourData.low.toString(), TEST_ETH_PRICE_USD.toString());
        assert.deepEqual(tokenHourData.close.toString(), TEST_ETH_PRICE_USD.toString());
        assert.deepEqual(tokenHourData.priceUSD.toString(), TEST_ETH_PRICE_USD.toString());
        assert.deepEqual(tokenHourData.totalValueLocked.toString(), '100');
        assert.deepEqual(tokenHourData.totalValueLockedUSD.toString(), '1000');

        // update the high price
        token.derivedETH = new BigDecimal('2');
        newMockDb = newMockDb.entities.Token.set(token);
        newMockDb = updateTokenHourData(timestamp, token, bundle, newMockDb);
        const highPriceStr = TEST_ETH_PRICE_USD.times(new BigDecimal('2')).toString();
        tokenHourData = newMockDb.entities.TokenHourData.get(tokenHourID);

        assert.deepEqual(tokenHourData.periodStartUnix, hourStartUnix);
        assert.deepEqual(tokenHourData.token_id, tokenId);
        assert.deepEqual(tokenHourData.volume.toString(), '0');
        assert.deepEqual(tokenHourData.volumeUSD.toString(), '0');
        assert.deepEqual(tokenHourData.feesUSD.toString(), '0');
        assert.deepEqual(tokenHourData.untrackedVolumeUSD.toString(), '0');
        // assert.deepEqual(tokenHourData.openingPrice.toString(), TEST_ETH_PRICE_USD.toString());
        assert.deepEqual(tokenHourData.high.toString(), highPriceStr);
        assert.deepEqual(tokenHourData.low.toString(), TEST_ETH_PRICE_USD.toString());
        assert.deepEqual(tokenHourData.close.toString(), highPriceStr);
        assert.deepEqual(tokenHourData.priceUSD.toString(), highPriceStr);
        assert.deepEqual(tokenHourData.totalValueLocked.toString(), '100');
        assert.deepEqual(tokenHourData.totalValueLockedUSD.toString(), '1000');

        // update the low price
        token.derivedETH = ZERO_BD
        newMockDb = newMockDb.entities.Token.set(token);
        newMockDb = updateTokenHourData(timestamp, token, bundle, newMockDb);
        const lowPriceStr = ZERO_BD.toString()
        tokenHourData = newMockDb.entities.TokenHourData.get(tokenHourID);

        assert.deepEqual(tokenHourData.periodStartUnix, hourStartUnix);
        assert.deepEqual(tokenHourData.token_id, tokenId);
        assert.deepEqual(tokenHourData.volume.toString(), '0');
        assert.deepEqual(tokenHourData.volumeUSD.toString(), '0');
        assert.deepEqual(tokenHourData.feesUSD.toString(), '0');
        assert.deepEqual(tokenHourData.untrackedVolumeUSD.toString(), '0');
        // assert.deepEqual(tokenHourData.openingPrice.toString(), TEST_ETH_PRICE_USD.toString());
        assert.deepEqual(tokenHourData.high.toString(), highPriceStr);
        assert.deepEqual(tokenHourData.low.toString(), lowPriceStr);
        assert.deepEqual(tokenHourData.close.toString(), lowPriceStr);
        assert.deepEqual(tokenHourData.priceUSD.toString(), lowPriceStr);
        assert.deepEqual(tokenHourData.totalValueLocked.toString(), '100');
        assert.deepEqual(tokenHourData.totalValueLockedUSD.toString(), '1000');
    });
});
