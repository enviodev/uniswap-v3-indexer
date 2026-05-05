import assert from "assert";
import { safeDiv } from '../src/handlers/utils';
import { getNativePriceInUSD, findNativePerToken } from './testUtils.test';
import { ZERO_BD, ZERO_BI, ONE_BD, ADDRESS_ZERO } from '../src/handlers/utils/constants';
import { TestHelpers, Pool, Bundle, BigDecimal, Token } from "envio";
import {
    createAndStoreTestPool,
    createAndStoreTestToken,
    TEST_CONFIG,
    TEST_ETH_PRICE_USD,
    USDC_MAINNET_FIXTURE,
    USDC_WETH_03_MAINNET_POOL,
    USDC_WETH_03_MAINNET_POOL_FIXTURE,
    WBTC_MAINNET_FIXTURE,
    WBTC_WETH_03_MAINNET_POOL,
    WBTC_WETH_03_MAINNET_POOL_FIXTURE,
    WETH_MAINNET_FIXTURE,
    chainId,
    timestamp,
    blockNumber
} from './constants'

const { MockDb, UniswapV3Pool } = TestHelpers;

interface InitializeFixture {
    sqrtPriceX96: bigint
    tick: bigint
};

const INITIALIZE_FIXTURE: InitializeFixture = {
    sqrtPriceX96: BigInt('1111111111111111'),
    tick: 194280n,
};

const INITIALIZE_EVENT = UniswapV3Pool.Initialize.createMockEvent({
    sqrtPriceX96: INITIALIZE_FIXTURE.sqrtPriceX96,
    tick: INITIALIZE_FIXTURE.tick,
    mockEventData: {
        srcAddress: USDC_WETH_03_MAINNET_POOL,
        chainId,
        block: { timestamp, number: blockNumber }
    }
});

describe('Initialize pool', () => {
    it('success', async () => {
        let [pool, mockDb] = createAndStoreTestPool(
            USDC_WETH_03_MAINNET_POOL_FIXTURE, 
            chainId, 
            MockDb.createMockDb()
        );
        let token0, token1;

        [token0, mockDb] = createAndStoreTestToken(USDC_MAINNET_FIXTURE, chainId, mockDb);
        [token1, mockDb] = createAndStoreTestToken(WETH_MAINNET_FIXTURE, chainId, mockDb);

        const bundle: Bundle = {
            id: chainId.toString(),
            ethPriceUSD: TEST_ETH_PRICE_USD
        };
        
        mockDb = mockDb.entities.Bundle.set(bundle);
        mockDb = await UniswapV3Pool.Initialize.processEvent({event: INITIALIZE_EVENT, mockDb});

        const expectedBundle: Bundle = {
            id: chainId.toString(),
            ethPriceUSD: getNativePriceInUSD(mockDb, chainId, USDC_WETH_03_MAINNET_POOL, true)
        };

        const actualBundle = mockDb.entities.Bundle.get(chainId.toString());
        const expectedPool = {...pool};
        expectedPool.sqrtPrice = INITIALIZE_FIXTURE.sqrtPriceX96;
        expectedPool.tick = INITIALIZE_FIXTURE.tick;

        const actualPool = mockDb.entities.Pool.get(expectedPool.id);

        const expectedToken0Price = findNativePerToken(
            mockDb,
            token0 as Token,
            actualBundle,
            TEST_CONFIG.wrappedNativeAddress,
            TEST_CONFIG.stablecoinAddresses,
            TEST_CONFIG.minimumNativeLocked,
        );
        const expectedToken0 = {...token0};
        expectedToken0.derivedETH = expectedToken0Price;

        const expectedToken1Price = findNativePerToken(
        mockDb,
        token1 as Token,
        actualBundle,
        TEST_CONFIG.wrappedNativeAddress,
        TEST_CONFIG.stablecoinAddresses,
        TEST_CONFIG.minimumNativeLocked,
        );
        const expectedToken1 = {...token1};
        expectedToken1.derivedETH = expectedToken1Price;

        const actualToken0 = mockDb.entities.Token.get(token0.id);
        const actualToken1 = mockDb.entities.Token.get(token1.id);

        assert.deepEqual(actualPool, expectedPool);
        assert.deepEqual(actualBundle, expectedBundle);
        assert.deepEqual(actualToken0, expectedToken0);
        assert.deepEqual(actualToken1, expectedToken1);
    });
});

describe('getEthPriceInUSD', () => {
    const [pool, mockDb] = createAndStoreTestPool(
        USDC_WETH_03_MAINNET_POOL_FIXTURE, 
        chainId, 
        MockDb.createMockDb()
    );

    it('success - stablecoin is token0', () => {
        const newPool: Pool = { ...pool, token0Price: ONE_BD };
        const newMockDb = mockDb.entities.Pool.set(newPool);

        const ethPriceUSD = getNativePriceInUSD(
            newMockDb,
            chainId,
            USDC_WETH_03_MAINNET_POOL, 
            true
        );

        assert.deepEqual(ethPriceUSD, ONE_BD);
    });

    it('success - stablecoin is token1', () => {
        const newPool: Pool = { ...pool, token1Price: ONE_BD };
        const newMockDb = mockDb.entities.Pool.set(newPool);

        const ethPriceUSD = getNativePriceInUSD(
            newMockDb,
            chainId,
            USDC_WETH_03_MAINNET_POOL, 
            false
        );

        assert.deepEqual(ethPriceUSD, ONE_BD);
    });

    it('failure - pool not found', () => {
        const newPool: Pool = { ...pool, token0Price: ONE_BD, token1Price: ONE_BD };
        const newMockDb = mockDb.entities.Pool.set(newPool);

        const ethPriceUSD = getNativePriceInUSD(
            newMockDb,
            chainId,
            ADDRESS_ZERO, 
            true
        );

        assert.deepEqual(ethPriceUSD, ZERO_BD);
    });
});

describe('findNativePerToken', () => {
    const bundle: Bundle = { id: chainId.toString(), ethPriceUSD: TEST_ETH_PRICE_USD };
    const mockDb = MockDb.createMockDb().entities.Bundle.set(bundle);

    it('success - token is wrapped native', () => {
        const [token, newMockDb] = createAndStoreTestToken(WETH_MAINNET_FIXTURE, chainId, mockDb);

        const ethPerToken = findNativePerToken(
            newMockDb,
            token as Token,
            bundle,
            TEST_CONFIG.wrappedNativeAddress,
            TEST_CONFIG.stablecoinAddresses,
            TEST_CONFIG.minimumNativeLocked,
        );

        assert.deepEqual(ethPerToken, ONE_BD);
    });

    it('success - token is stablecoin', () => {
        const [token, newMockDb] = createAndStoreTestToken(USDC_MAINNET_FIXTURE, chainId, mockDb);

        const ethPerToken = findNativePerToken(
            newMockDb,
            token as Token,
            bundle,
            TEST_CONFIG.wrappedNativeAddress,
            TEST_CONFIG.stablecoinAddresses,
            TEST_CONFIG.minimumNativeLocked,
        );

        const expectedStablecoinPrice = safeDiv(ONE_BD, TEST_ETH_PRICE_USD);
        assert.deepEqual(ethPerToken, expectedStablecoinPrice);
    });

    it('success - token is not wrapped native or stablecoin', () => {
        let token;
        let [pool, newMockDb] = createAndStoreTestPool(
            WBTC_WETH_03_MAINNET_POOL_FIXTURE,
            chainId,
            mockDb
        );
        
        pool = {
            ...pool,
            liquidity: 100n,
            totalValueLockedToken1: new BigDecimal('100'),
            token1Price: new BigDecimal('5')
        };
        
        newMockDb = newMockDb.entities.Pool.set(pool);

        [token, newMockDb] = createAndStoreTestToken(
            WBTC_MAINNET_FIXTURE,
            chainId,
            newMockDb
        );

        const token0 = {
            ...token,
            whitelistPools: [`${chainId}-${WBTC_WETH_03_MAINNET_POOL.toLowerCase()}`]
        };
        
        newMockDb = newMockDb.entities.Token.set(token0);

        [token, newMockDb] = createAndStoreTestToken(
            WETH_MAINNET_FIXTURE,
            chainId,
            newMockDb
        );

        const token1 = {
            ...token,
            derivedETH: new BigDecimal('10')
        };

        newMockDb = newMockDb.entities.Token.set(token1);

        const minimumEthLocked = ZERO_BD;
        const ethPerToken = findNativePerToken(
            newMockDb,
            token0 as Token,
            bundle,
            WETH_MAINNET_FIXTURE.address,
            [USDC_MAINNET_FIXTURE.address],
            minimumEthLocked,
        );

        assert.deepEqual(ethPerToken, new BigDecimal('50'));
    });

    it('success - token is not wrapped native or stablecoin, but has no pools', () => {
        const [token0, newMockDb] = createAndStoreTestToken(
            WBTC_MAINNET_FIXTURE,
            chainId,
            mockDb
        );

        const ethPerToken = findNativePerToken(
            newMockDb,
            token0 as Token,
            bundle,
            TEST_CONFIG.wrappedNativeAddress,
            TEST_CONFIG.stablecoinAddresses,
            TEST_CONFIG.minimumNativeLocked,
        );

        assert.deepEqual(ethPerToken, new BigDecimal('0'));
    });

    it('success - token is not wrapped native or stablecoin, but has no pools with liquidity', () => {
        let [token0, newMockDb] = createAndStoreTestToken(
            WBTC_MAINNET_FIXTURE,
            chainId,
            mockDb
        );

        token0 = {
            ...token0,
            whitelistPools: [WBTC_WETH_03_MAINNET_POOL]
        };
        
        newMockDb = newMockDb.entities.Token.set(token0);

        const ethPerToken = findNativePerToken(
            newMockDb,
            token0 as Token,
            bundle,
            TEST_CONFIG.wrappedNativeAddress,
            TEST_CONFIG.stablecoinAddresses,
            TEST_CONFIG.minimumNativeLocked,
        );

        assert.deepEqual(ethPerToken, ZERO_BD);
    });
});
