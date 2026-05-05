import assert from "assert";
import { convertTokenToDecimal, fastExponentiation, safeDiv } from '../src/handlers/utils';
import { ONE_BD } from '../src/handlers/utils/constants';
import { TestHelpers, Pool, Bundle, BigDecimal, Mint, Token, Factory, Tick } from "envio";
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
const txHash = "0xd6005a794596212a1bdc19178e04e18eb8e9e0963d7073303bcb47d6186e757e";

interface MintFixture {
    sender: string
    owner: string
    tickLower: bigint
    tickUpper: bigint
    amount: bigint
    amount0: bigint
    amount1: bigint
};

// https://etherscan.io/tx/0x0338617bb36e23bbd4074b068ea79edd07f7ef0db13fc0cd06ab8e57b9012764
const MINT_FIXTURE: MintFixture = {
    sender: '0xc36442b4a4522e871399cd717abdd847ab11fe88',
    owner: '0xc36442b4a4522e871399cd717abdd847ab11fe88',
    tickLower: 195600n,
    tickUpper: 196740n,
    amount: 386405747494368n,
    amount0: 1000000000n,
    amount1: 66726312884609397n,
};

const mintEvent = UniswapV3Pool.Mint.createMockEvent({
    sender: MINT_FIXTURE.sender,
    owner: MINT_FIXTURE.owner,
    tickLower: MINT_FIXTURE.tickLower,
    tickUpper: MINT_FIXTURE.tickUpper,
    amount: MINT_FIXTURE.amount,
    amount0: MINT_FIXTURE.amount0,
    amount1: MINT_FIXTURE.amount1,
    mockEventData: {
        srcAddress: USDC_WETH_03_MAINNET_POOL,
        chainId,
        logIndex,
        block: { timestamp, number: blockNumber },
        transaction: {
            gasPrice: 10000000n,
            hash: txHash,
            from: txFrom
        }
    }
});

describe('handleMint', async () => {
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

    it('success - mint event, pool tick is between tickUpper and tickLower', async () => {
        // put the pools tick in range
        const pool: Pool = {
            ...mockDb.entities.Pool.get(poolId),
            tick: BigInt(MINT_FIXTURE.tickLower + MINT_FIXTURE.tickUpper) / 2n
        };
    
        let newMockdb = mockDb.entities.Pool.set(pool);

        newMockdb = await UniswapV3Pool.Mint.processEvent({ event: mintEvent, mockDb: newMockdb });

        const amountToken0 = convertTokenToDecimal(MINT_FIXTURE.amount0, BigInt(USDC_MAINNET_FIXTURE.decimals));
        const amountToken1 = convertTokenToDecimal(MINT_FIXTURE.amount1, BigInt(WETH_MAINNET_FIXTURE.decimals));
        const poolTotalValueLockedETH = amountToken0
                                        .times(TEST_USDC_DERIVED_ETH)
                                        .plus(amountToken1.times(TEST_WETH_DERIVED_ETH));
        const poolTotalValueLockedUSD = poolTotalValueLockedETH.times(TEST_ETH_PRICE_USD);

        const factory: Factory = newMockdb.entities.Factory.get(
            `${chainId}-${TEST_CONFIG.factoryAddress.toLowerCase()}`
        );

        assert.deepEqual(factory.txCount, 1n);
        assert.deepEqual(factory.totalValueLockedETH, poolTotalValueLockedETH);
        assert.deepEqual(factory.totalValueLockedUSD, poolTotalValueLockedUSD);

        const actualPool: Pool = newMockdb.entities.Pool.get(poolId);
        assert.deepEqual(actualPool.txCount, 1n);
        assert.deepEqual(actualPool.liquidity, MINT_FIXTURE.amount);
        assert.deepEqual(actualPool.totalValueLockedToken0, amountToken0);
        assert.deepEqual(actualPool.totalValueLockedToken1, amountToken1);
        assert.deepEqual(actualPool.totalValueLockedETH, poolTotalValueLockedETH);
        assert.deepEqual(actualPool.totalValueLockedUSD, poolTotalValueLockedUSD);

        const token0Id = `${chainId}-${USDC_MAINNET_FIXTURE.address.toLowerCase()}`;
        const token0: Token = newMockdb.entities.Token.get(token0Id);
        assert.deepEqual(token0.txCount, 1n);
        assert.deepEqual(token0.totalValueLocked.toString(), amountToken0.toString());
        assert.deepEqual(
            token0.totalValueLockedUSD.toString(),
            amountToken0.times(TEST_USDC_DERIVED_ETH.times(TEST_ETH_PRICE_USD)).toString()
        );

        const token1Id = `${chainId}-${WETH_MAINNET_FIXTURE.address.toLowerCase()}`;
        const token1: Token = newMockdb.entities.Token.get(token1Id);
        assert.deepEqual(token1.txCount, 1n);
        assert.deepEqual(token1.totalValueLocked.toString(), amountToken1.toString());
        assert.deepEqual(
            token1.totalValueLockedUSD.toString(),
            amountToken1.times(TEST_WETH_DERIVED_ETH.times(TEST_ETH_PRICE_USD)).toString()
        );

        const mintId = `${txHash}-${logIndex}`;
        const mint: Mint = newMockdb.entities.Mint.get(mintId);
        assert.deepEqual(mint.transaction_id, txHash);
        assert.deepEqual(mint.timestamp, timestamp);
        assert.deepEqual(mint.pool_id, poolId);
        assert.deepEqual(mint.token0_id, token0Id);
        assert.deepEqual(mint.token1_id, token1Id);
        assert.deepEqual(mint.owner, MINT_FIXTURE.owner.toLowerCase());
        assert.deepEqual(mint.sender, MINT_FIXTURE.sender.toLowerCase());
        assert.deepEqual(mint.origin, txFrom.toLowerCase());
        assert.deepEqual(mint.amount, MINT_FIXTURE.amount);
        assert.deepEqual(mint.amount0.toString(), amountToken0.toString());
        assert.deepEqual(mint.amount1.toString(), amountToken1.toString());
        assert.deepEqual(mint.amountUSD?.toString(), poolTotalValueLockedUSD.toString());
        assert.deepEqual(mint.tickLower, MINT_FIXTURE.tickLower);
        assert.deepEqual(mint.tickUpper, MINT_FIXTURE.tickUpper);
        assert.deepEqual(mint.logIndex, logIndex);

        const lowerTickId = `${poolId}#${MINT_FIXTURE.tickLower.toString()}`;
        const lowerTick: Tick = newMockdb.entities.Tick.get(lowerTickId);
        const lowerTickPrice = fastExponentiation(new BigDecimal('1.0001'), MINT_FIXTURE.tickLower);
        assert.deepEqual(lowerTick.tickIdx, MINT_FIXTURE.tickLower);
        assert.deepEqual(lowerTick.pool_id, poolId);
        assert.deepEqual(lowerTick.poolAddress, poolId);
        assert.deepEqual(lowerTick.createdAtTimestamp, BigInt(timestamp));
        assert.deepEqual(lowerTick.createdAtBlockNumber, BigInt(blockNumber));
        assert.deepEqual(lowerTick.liquidityGross, MINT_FIXTURE.amount);
        assert.deepEqual(lowerTick.liquidityNet, MINT_FIXTURE.amount);
        assert.deepEqual(lowerTick.price0.toString(), lowerTickPrice.toString());
        assert.deepEqual(lowerTick.price1.toString(), safeDiv(ONE_BD, lowerTickPrice).toString());

        const upperTickId = `${poolId}#${MINT_FIXTURE.tickUpper.toString()}`;
        const upperTick: Tick = newMockdb.entities.Tick.get(upperTickId);
        const upperTickPrice = fastExponentiation(new BigDecimal('1.0001'), MINT_FIXTURE.tickUpper);
        assert.deepEqual(upperTick.tickIdx, MINT_FIXTURE.tickUpper);
        assert.deepEqual(upperTick.pool_id, poolId);
        assert.deepEqual(upperTick.poolAddress, poolId);
        assert.deepEqual(upperTick.createdAtTimestamp, BigInt(timestamp));
        assert.deepEqual(upperTick.createdAtBlockNumber, BigInt(blockNumber));
        assert.deepEqual(upperTick.liquidityGross, MINT_FIXTURE.amount);
        assert.deepEqual(upperTick.liquidityNet, -MINT_FIXTURE.amount);
        assert.deepEqual(upperTick.price0.toString(), upperTickPrice.toString());
        assert.deepEqual(upperTick.price1.toString(), safeDiv(ONE_BD, upperTickPrice).toString());
    });

    it('success - mint event, pool tick is not between tickUpper and tickLower', async () => {
        // put the pools tick out of range
        let pool: Pool = {
            ...mockDb.entities.Pool.get(poolId),
            tick: MINT_FIXTURE.tickLower - 1n
        };

        let newMockDb = mockDb.entities.Pool.set(pool);
        const liquidityBeforeMint = pool.liquidity;

        newMockDb = await UniswapV3Pool.Mint.processEvent({ event: mintEvent, mockDb: newMockDb });
        pool = newMockDb.entities.Pool.get(poolId);

        // liquidity should not be updated
        assert.deepEqual(pool.liquidity, liquidityBeforeMint);
    });
});
