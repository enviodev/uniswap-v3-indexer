import assert from "assert";
import { convertTokenToDecimal } from '../src/handlers/utils';
import { ZERO_BD, ZERO_BI } from '../src/handlers/utils/constants';
import { TestHelpers, Pool, Bundle, Collect, Token, Factory } from "envio";
import {
    invokePoolCreatedWithMockedEthCalls,
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
const txHash = "0x328c84a513e6146dd3cf28861e8f2445e38d251c4b8a922057c755e12281c7ea";

interface CollectFixture {
    owner: string
    recipient: string
    tickLower: bigint
    tickUpper: bigint
    amount0: bigint
    amount1: bigint
};

// https://etherscan.io/tx/0x328c84a513e6146dd3cf28861e8f2445e38d251c4b8a922057c755e12281c7ea
const COLLECT_FIXTURE: CollectFixture = {
    owner: '0xc36442b4a4522e871399cd717abdd847ab11fe88',
    recipient: '0xc36442b4a4522e871399cd717abdd847ab11fe88',
    tickLower: 81600n,
    tickUpper: 84120n,
    amount0: ZERO_BI,
    amount1: BigInt('19275229182128904')
};

const COLLECT_EVENT = UniswapV3Pool.Collect.createMockEvent({
    ...COLLECT_FIXTURE,
    mockEventData: {
        logIndex,
        srcAddress: USDC_WETH_03_MAINNET_POOL,
        chainId,
        block: { timestamp, number: blockNumber },
        transaction: {
            gasPrice: 10000000n,
            hash: txHash
        }
    }
});

describe('handleMint', async () => {
    let mockDb = await invokePoolCreatedWithMockedEthCalls(TEST_CONFIG, MockDb.createMockDb());
    
    const bundle: Bundle = {
        id: chainId.toString(),
        ethPriceUSD: TEST_ETH_PRICE_USD
    };
    
    mockDb = mockDb.entities.Bundle.set(bundle);

    const usdcEntity: Token = {
        ...mockDb.entities.Token.get(`${chainId}-${USDC_MAINNET_FIXTURE.address.toLowerCase()}`),
        derivedETH: TEST_USDC_DERIVED_ETH
    };

    mockDb = mockDb.entities.Token.set(usdcEntity);

    const wethEntity: Token = {
        ...mockDb.entities.Token.get(`${chainId}-${WETH_MAINNET_FIXTURE.address.toLowerCase()}`),
        derivedETH: TEST_WETH_DERIVED_ETH
    };

    mockDb = mockDb.entities.Token.set(wethEntity);

    it('success - collect event', async () => {
        const poolId = `${chainId}-${USDC_WETH_03_MAINNET_POOL.toLowerCase()}`;
                const pool: Pool = {
                    ...mockDb.entities.Pool.get(poolId),
                    tick: BigInt(COLLECT_FIXTURE.tickLower + COLLECT_FIXTURE.tickUpper) / 2n
                };
            
        let newMockDb = mockDb.entities.Pool.set(pool);
        const trackedCollectedAmountUSD = ZERO_BD;
        newMockDb = await UniswapV3Pool.Collect.processEvent({ event: COLLECT_EVENT, mockDb: newMockDb });

        const collectedAmountToken0 = convertTokenToDecimal(
            COLLECT_FIXTURE.amount0,
            BigInt(USDC_MAINNET_FIXTURE.decimals)
        );

        const collectedAmountToken1 = convertTokenToDecimal(
            COLLECT_FIXTURE.amount1,
            BigInt(WETH_MAINNET_FIXTURE.decimals)
        );

        const collectedAmountETH = collectedAmountToken0
                                    .times(TEST_USDC_DERIVED_ETH)
                                    .plus(collectedAmountToken1.times(TEST_WETH_DERIVED_ETH));
        const collectedAmountUSD = collectedAmountETH.times(TEST_ETH_PRICE_USD);

        const factory: Factory = newMockDb.entities.Factory.get(
            `${chainId}-${TEST_CONFIG.factoryAddress.toLowerCase()}`
        );

        assert.deepEqual(factory.txCount, 1n);
        assert.deepEqual(factory.totalValueLockedETH.toString(), collectedAmountETH.negated().toString());
        assert.deepEqual(factory.totalValueLockedUSD.toString(), collectedAmountUSD.negated().toString());

        const actualPool: Pool = newMockDb.entities.Pool.get(poolId);
        assert.deepEqual(actualPool.txCount, 1n);
        assert.deepEqual(actualPool.totalValueLockedToken0.toString(), collectedAmountToken0.negated().toString());
        assert.deepEqual(actualPool.totalValueLockedToken1.toString(), collectedAmountToken1.negated().toString());
        assert.deepEqual(actualPool.totalValueLockedETH.toString(), collectedAmountETH.negated().toString());
        assert.deepEqual(actualPool.totalValueLockedUSD.toString(), collectedAmountUSD.negated().toString());
        assert.deepEqual(actualPool.collectedFeesToken0.toString(), collectedAmountToken0.toString());
        assert.deepEqual(actualPool.collectedFeesToken1.toString(), collectedAmountToken1.toString());
        // assert.deepEqual(actualPool.collectedFeesUSD.toString(), trackedCollectedAmountUSD.toString());

        const token0: Token = newMockDb.entities.Token.get(
            `${chainId}-${USDC_MAINNET_FIXTURE.address.toLowerCase()}`
        );
        assert.deepEqual(token0.txCount, 1n);
        assert.deepEqual(token0.totalValueLocked.toString(), collectedAmountToken0.negated().toString());
        assert.deepEqual(
            token0.totalValueLockedUSD.toString(), 
            collectedAmountToken0.times(TEST_USDC_DERIVED_ETH.times(TEST_ETH_PRICE_USD)).negated().toString()
        );

        const token1: Token = newMockDb.entities.Token.get(
            `${chainId}-${WETH_MAINNET_FIXTURE.address.toLowerCase()}`
        );
        assert.deepEqual(token1.txCount, 1n);
        assert.deepEqual(token1.totalValueLocked.toString(), collectedAmountToken1.negated().toString());
        assert.deepEqual(
            token1.totalValueLockedUSD.toString(), 
            collectedAmountToken1.times(TEST_WETH_DERIVED_ETH.times(TEST_ETH_PRICE_USD)).negated().toString()
        );

        const collect: Collect = newMockDb.entities.Collect.get(`${txHash}-${logIndex}`);
        assert.deepEqual(collect.transaction_id, txHash);
        assert.deepEqual(collect.pool_id, poolId);
        assert.deepEqual(collect.owner, COLLECT_FIXTURE.owner);
        assert.deepEqual(collect.amount0.toString(), collectedAmountToken0.toString());
        assert.deepEqual(collect.amount1.toString(), collectedAmountToken1.toString());
        assert.deepEqual(collect.tickLower, COLLECT_FIXTURE.tickLower);
        assert.deepEqual(collect.tickUpper, COLLECT_FIXTURE.tickUpper);
        assert.deepEqual(collect.logIndex, logIndex);
        // assert.deepEqual(collect.amountUSD?.toString(), trackedCollectedAmountUSD.toString());
    });
});
