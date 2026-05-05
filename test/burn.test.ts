import assert from "assert";
import { TestHelpers, Bundle, Burn, Pool, BigDecimal, Factory, Tick, Token } from "envio";
import { convertTokenToDecimal, fastExponentiation, safeDiv } from '../src/handlers/utils';
import { ZERO_BD, ONE_BD, ZERO_BI, ONE_BI } from '../src/handlers/utils/constants';
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
const txFrom = '0xa79d3B28A109F0E3E4919c9715748dB6D88f313f';
const txHash = "0x26b168e005a168b28d518675435c9f51816697c086deef7377e0018e4eb65dc9";

interface BurnFixture {
    owner: string
    tickLower: bigint
    tickUpper: bigint
    amount: bigint
    amount0: bigint
    amount1: bigint
};

// https://etherscan.io/tx/0x26b168e005a168b28d518675435c9f51816697c086deef7377e0018e4eb65dc9
const BURN_FIXTURE: BurnFixture = {
    owner: '0x8692f704a20d11be3b32de68656651b5291ed26c',
    tickLower: 194280n,
    tickUpper: 194520n,
    amount: 107031367278175302n,
    amount0: 77186598043n,
    amount1: ZERO_BI,
};

const BURN_EVENT = UniswapV3Pool.Burn.createMockEvent({
    ...BURN_FIXTURE,
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

describe('handleBurn', async () => {
    const poolId = `${chainId}-${USDC_WETH_03_MAINNET_POOL.toLowerCase()}`;
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

    // Precalculates since the "fastExponentiation" operation is slow
    // const tlPrice0 = fastExponentiation(new BigDecimal('1.0001'), BURN_FIXTURE.tickLower);
    // const tuPrice0 = fastExponentiation(new BigDecimal('1.0001'), BURN_FIXTURE.tickUpper);
    const tlPrice0 = new BigDecimal('273559215.036801');
    const tuPrice0 = new BigDecimal('280203719.109703');

    const tickLower: Tick = {
        id: `${poolId}#${BURN_FIXTURE.tickLower.toString()}`,
        tickIdx: BURN_FIXTURE.tickLower,
        pool_id: poolId,
        poolAddress: USDC_WETH_03_MAINNET_POOL,
        createdAtTimestamp: BigInt(timestamp),
        createdAtBlockNumber: BigInt(blockNumber),
        liquidityGross: ZERO_BI,
        liquidityNet: ZERO_BI,
        price0: tlPrice0,
        price1: safeDiv(ONE_BD, tlPrice0),
    };

    mockDb = mockDb.entities.Tick.set(tickLower);

    const tickUpper: Tick = {
        id: `${poolId}#${BURN_FIXTURE.tickUpper.toString()}`,
        tickIdx: BURN_FIXTURE.tickUpper,
        pool_id: poolId,
        poolAddress: USDC_WETH_03_MAINNET_POOL,
        createdAtTimestamp: BigInt(timestamp),
        createdAtBlockNumber: BigInt(blockNumber),
        liquidityGross: ZERO_BI,
        liquidityNet: ZERO_BI,
        price0: tuPrice0,
        price1: safeDiv(ONE_BD, tuPrice0)
    };

    mockDb = mockDb.entities.Tick.set(tickUpper);

    // note: all tvl should be zero in this test because burns don't remove TVL, only collects do
    it('success - burn event, pool tick is between tickUpper and tickLower', async () => {
        // put the pools tick in range
        const pool: Pool = {
            ...mockDb.entities.Pool.get(poolId),
            tick: (BURN_FIXTURE.tickLower + BURN_FIXTURE.tickUpper) / 2n
        };

        let newMockDb = mockDb.entities.Pool.set(pool);
        newMockDb = await UniswapV3Pool.Burn.processEvent({ event: BURN_EVENT, mockDb: newMockDb });

        const amountToken0 = convertTokenToDecimal(BURN_FIXTURE.amount0, BigInt(USDC_MAINNET_FIXTURE.decimals));
        const amountToken1 = convertTokenToDecimal(BURN_FIXTURE.amount1, BigInt(WETH_MAINNET_FIXTURE.decimals));
        const poolTotalValueLockedETH = amountToken0
                                        .times(TEST_USDC_DERIVED_ETH)
                                        .plus(amountToken1.times(TEST_WETH_DERIVED_ETH));
        const poolTotalValueLockedUSD = poolTotalValueLockedETH.times(TEST_ETH_PRICE_USD);

        const factory: Factory = newMockDb.entities.Factory.get(
            `${chainId}-${TEST_CONFIG.factoryAddress.toLowerCase()}`
        );
        assert.deepEqual(factory.txCount, 1n);
        assert.deepEqual(factory.totalValueLockedETH.toString(), '0');
        assert.deepEqual(factory.totalValueLockedUSD.toString(), '0');

        const actualPool: Pool = newMockDb.entities.Pool.get(poolId);
        assert.deepEqual(actualPool.txCount, 1n);
        assert.deepEqual(actualPool.liquidity, -BURN_FIXTURE.amount);
        assert.deepEqual(actualPool.totalValueLockedToken0.toString(), '0');
        assert.deepEqual(actualPool.totalValueLockedToken1.toString(), '0');
        assert.deepEqual(actualPool.totalValueLockedETH.toString(), '0');
        assert.deepEqual(actualPool.totalValueLockedUSD.toString(), '0');

        const token0: Token = newMockDb.entities.Token.get(
            `${chainId}-${USDC_MAINNET_FIXTURE.address.toLowerCase()}`
        );
        assert.deepEqual(token0.txCount, 1n);
        assert.deepEqual(token0.totalValueLocked.toString(), '0');
        assert.deepEqual(token0.totalValueLockedUSD.toString(), '0');

        const token1: Token = newMockDb.entities.Token.get(
            `${chainId}-${WETH_MAINNET_FIXTURE.address.toLowerCase()}`
        );
        assert.deepEqual(token1.txCount, 1n);
        assert.deepEqual(token1.totalValueLocked.toString(), '0');
        assert.deepEqual(token1.totalValueLockedUSD.toString(), '0');

        const burn: Burn = newMockDb.entities.Burn.get(`${txHash}-${logIndex}`);
        assert.deepEqual(burn.transaction_id, txHash);
        assert.deepEqual(burn.timestamp, BigInt(timestamp));
        assert.deepEqual(burn.pool_id, poolId);
        assert.deepEqual(burn.token0_id, token0.id);
        assert.deepEqual(burn.token1_id, token1.id);
        assert.deepEqual(burn.owner, BURN_FIXTURE.owner);
        assert.deepEqual(burn.origin, txFrom.toLowerCase());
        assert.deepEqual(burn.amount, BURN_FIXTURE.amount);
        assert.deepEqual(burn.amount0.toString(), amountToken0.toString());
        assert.deepEqual(burn.amount1.toString(), amountToken1.toString());
        assert.deepEqual(burn.amountUSD?.toString(), poolTotalValueLockedUSD.toString());
        assert.deepEqual(burn.tickLower, BURN_FIXTURE.tickLower);
        assert.deepEqual(burn.tickUpper, BURN_FIXTURE.tickUpper);
        assert.deepEqual(burn.logIndex, logIndex);

        const tickLower: Tick = newMockDb.entities.Tick.get(
            `${poolId}#${BURN_FIXTURE.tickLower.toString()}`
        );
        assert.deepEqual(tickLower.liquidityGross, -BURN_FIXTURE.amount);
        assert.deepEqual(tickLower.liquidityNet, -BURN_FIXTURE.amount);

        const tickUpper: Tick = newMockDb.entities.Tick.get(
            `${poolId}#${BURN_FIXTURE.tickUpper.toString()}`
        );
        assert.deepEqual(tickUpper.liquidityGross, -BURN_FIXTURE.amount);
        assert.deepEqual(tickUpper.liquidityNet, -BURN_FIXTURE.amount);
    });

    it('success - burn event, pool tick is not between tickUpper and tickLower', async () => {
        // put the pools tick out of range
        const pool: Pool = {
            ...mockDb.entities.Pool.get(poolId),
            tick: BURN_FIXTURE.tickLower - ONE_BI
        };
        const liquidityBeforeBurn = pool.liquidity;
        let newMockDb = mockDb.entities.Pool.set(pool);
        newMockDb = await UniswapV3Pool.Burn.processEvent({ event: BURN_EVENT, mockDb: newMockDb });
        const actualPool: Pool = newMockDb.entities.Pool.get(poolId);

        // liquidity should not be updated
        assert.deepEqual(actualPool.liquidity, liquidityBeforeBurn);
    });
});
