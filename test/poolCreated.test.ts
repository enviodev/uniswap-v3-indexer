import assert from "assert";
import { TestHelpers, Pool, Token, Factory, Bundle } from "envio";
import { ZERO_BD, ZERO_BI, ADDRESS_ZERO } from '../src/handlers/utils/constants';
import { getTokenMetadata } from '../src/handlers/utils/tokenMetadata';
import {
    getPoolFixture,
    getTokenFixture,
    invokePoolCreatedWithMockedEthCalls,
    TEST_CONFIG,
    TEST_CONFIG_WITH_POOL_SKIPPED,
    USDC_MAINNET_FIXTURE,
    chainId,
    timestamp,
    blockNumber
} from './constants';

const { MockDb } = TestHelpers;

describe('handlePoolCreated', () => {
    it('success - create a pool', async () => {
        const poolAddress = TEST_CONFIG.stablecoinWrappedNativePoolId;
        const poolFixture = getPoolFixture(poolAddress);
        const token0Fixture = getTokenFixture(poolFixture.token0.address);
        const token1Fixture = getTokenFixture(poolFixture.token1.address);
        const mockDb = await invokePoolCreatedWithMockedEthCalls(TEST_CONFIG, MockDb.createMockDb());

        const poolId = `${chainId}-${poolAddress.toLowerCase()}`;
        const expectedPool: Pool = {
            id: poolId,
            createdAtTimestamp: BigInt(timestamp),
            createdAtBlockNumber: BigInt(blockNumber),
            token0_id: `${chainId}-${token0Fixture.address}`,
            token1_id: `${chainId}-${token1Fixture.address}`,
            feeTier: BigInt(poolFixture.feeTier),
            liquidity: ZERO_BI,
            sqrtPrice: ZERO_BI,
            token0Price: ZERO_BD,
            token1Price: ZERO_BD,
            tick: BigInt(poolFixture.tickSpacing),
            observationIndex: ZERO_BI,
            volumeToken0: ZERO_BD,
            volumeToken1: ZERO_BD,
            volumeUSD: ZERO_BD,
            untrackedVolumeUSD: ZERO_BD,
            feesUSD: ZERO_BD,
            txCount: ZERO_BI,
            collectedFeesToken0: ZERO_BD,
            collectedFeesToken1: ZERO_BD,
            collectedFeesUSD: ZERO_BD,
            totalValueLockedToken0: ZERO_BD,
            totalValueLockedToken1: ZERO_BD,
            totalValueLockedETH: ZERO_BD,
            totalValueLockedUSD: ZERO_BD,
            totalValueLockedUSDUntracked: ZERO_BD,
            liquidityProviderCount: ZERO_BI
        };

        const factoryId = `${chainId}-${TEST_CONFIG.factoryAddress.toLowerCase()}`;
        const expectedFactory: Factory = {
            id: factoryId,
            poolCount: 1n,
            numberOfSwaps: ZERO_BI,
            totalVolumeETH: ZERO_BD,
            totalVolumeUSD: ZERO_BD,
            untrackedVolumeUSD: ZERO_BD,
            totalFeesUSD: ZERO_BD,
            totalFeesETH: ZERO_BD,
            totalValueLockedETH: ZERO_BD,
            totalValueLockedUSD: ZERO_BD,
            totalValueLockedUSDUntracked: ZERO_BD,
            totalValueLockedETHUntracked: ZERO_BD,
            txCount: ZERO_BI,
            owner: ADDRESS_ZERO
        };

        const bundleId = chainId.toString();
        const expectedBundle: Bundle = {
            id: bundleId,
            ethPriceUSD: ZERO_BD
        };

        const token0Id = `${chainId}-${token0Fixture.address.toLowerCase()}`;
        const expectedToken0: Token = {
            id: token0Id,
            symbol: token0Fixture.symbol,
            name: token0Fixture.name,
            decimals: BigInt(token0Fixture.decimals),
            isWhitelisted: true,
            volume: ZERO_BD,
            volumeUSD: ZERO_BD,
            untrackedVolumeUSD: ZERO_BD,
            feesUSD: ZERO_BD,
            txCount: ZERO_BI,
            poolCount: ZERO_BI,
            totalValueLocked: ZERO_BD,
            totalValueLockedUSD: ZERO_BD,
            totalValueLockedUSDUntracked: ZERO_BD,
            derivedETH: ZERO_BD,
            whitelistPools: [poolId]
        };
        
        const token1Id = `${chainId}-${token1Fixture.address.toLowerCase()}`;
        const expectedToken1: Token = {
            id: token1Id,
            symbol: token1Fixture.symbol,
            name: token1Fixture.name,
            decimals: BigInt(token1Fixture.decimals),
            isWhitelisted: true,
            volume: ZERO_BD,
            volumeUSD: ZERO_BD,
            untrackedVolumeUSD: ZERO_BD,
            feesUSD: ZERO_BD,
            txCount: ZERO_BI,
            poolCount: ZERO_BI,
            totalValueLocked: ZERO_BD,
            totalValueLockedUSD: ZERO_BD,
            totalValueLockedUSDUntracked: ZERO_BD,
            derivedETH: ZERO_BD,
            whitelistPools: [poolId]
        };

        const actualPool = mockDb.entities.Pool.get(poolId);
        const actualFactory = mockDb.entities.Factory.get(factoryId);
        const actualBundle = mockDb.entities.Bundle.get(bundleId);
        const actualToken0 = mockDb.entities.Token.get(token0Id);
        const actualToken1 = mockDb.entities.Token.get(token1Id);

        assert.deepEqual(actualPool, expectedPool);
        assert.deepEqual(actualFactory, expectedFactory);
        assert.deepEqual(actualBundle, expectedBundle);
        assert.deepEqual(actualToken0, expectedToken0);
        assert.deepEqual(actualToken1, expectedToken1);
    })

    // it('success - skip pool creation if address in poolToSkip', async () => {
    //     const poolAddress = TEST_CONFIG_WITH_POOL_SKIPPED.stablecoinWrappedNativePoolId;
    //     const poolFixture = getPoolFixture(poolAddress);
    //     const token0Fixture = getTokenFixture(poolFixture.token0.address);
    //     const token1Fixture = getTokenFixture(poolFixture.token1.address);
    //     const mockDb = await invokePoolCreatedWithMockedEthCalls(TEST_CONFIG_WITH_POOL_SKIPPED, MockDb.createMockDb());
    //     const poolId = `${chainId}-${poolAddress.toLowerCase()}`;
    //     const factoryId = `${chainId}-${TEST_CONFIG_WITH_POOL_SKIPPED.factoryAddress.toLowerCase()}`;
    //     const token0Id = `${chainId}-${token0Fixture.address.toLowerCase()}`;
    //     const token1Id = `${chainId}-${token1Fixture.address.toLowerCase()}`;

    //     assert.deepEqual(mockDb.entities.Pool.get(poolId), undefined);
    //     assert.deepEqual(mockDb.entities.Factory.get(factoryId), undefined);
    //     assert.deepEqual(mockDb.entities.Token.get(token0Id), undefined);
    //     assert.deepEqual(mockDb.entities.Token.get(token1Id), undefined);
    // });
});

describe('fetchTokenSymbol', () => {
    it('success - fetch token symbol', async () => {
        const usdcAddress = USDC_MAINNET_FIXTURE.address;
        const metadata = await getTokenMetadata(usdcAddress, chainId);
        assert.deepEqual(metadata, { name: 'USD Coin', symbol: 'USDC', decimals: 6n });
    });
});
