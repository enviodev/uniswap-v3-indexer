import { createEffect, S } from "envio";
import { getContract } from "viem";
import { getClient, withTransportRetry } from "./tokenMetadataEffect";

const POOL_ABI = [
  {
    inputs: [],
    name: "liquidity",
    outputs: [{ type: "uint128" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "fee",
    outputs: [{ type: "uint24" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const ERC20_BALANCE_ABI = [
  {
    inputs: [{ type: "address" }],
    name: "balanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * On-chain reads for pre-regenesis pool backfill (subgraph
 * populateEmptyPools): pool liquidity, fee tier and raw token balances, read
 * at the block of the first post-regenesis PoolCreated event — the same
 * moment the subgraph performs its (implicitly latest-block) contract calls.
 * Requires an archive-capable RPC for the pinned block; results are cached so
 * the reads only ever happen once per pool.
 */
export const getPoolBackfillDataEffect = createEffect(
  {
    name: "getPoolBackfillData",
    input: {
      poolAddress: S.string,
      token0: S.string,
      token1: S.string,
      chainId: S.number,
      blockNumber: S.number,
    },
    output: {
      liquidity: S.bigint,
      feeTier: S.number,
      balance0: S.bigint,
      balance1: S.bigint,
    },
    rateLimit: false,
    cache: true,
  },
  async ({ input }) => {
    const { poolAddress, token0, token1, chainId, blockNumber } = input;
    const client = getClient(chainId);
    const blockTag = { blockNumber: BigInt(blockNumber) };

    const pool = getContract({
      address: poolAddress as `0x${string}`,
      abi: POOL_ABI,
      client,
    });
    const erc20 = (address: string) =>
      getContract({
        address: address as `0x${string}`,
        abi: ERC20_BALANCE_ABI,
        client,
      });

    const [liquidity, feeTier, balance0, balance1] = await withTransportRetry(
      () =>
        Promise.all([
          pool.read.liquidity(blockTag),
          pool.read.fee(blockTag),
          erc20(token0).read.balanceOf([poolAddress as `0x${string}`], blockTag),
          erc20(token1).read.balanceOf([poolAddress as `0x${string}`], blockTag),
        ])
    );

    return { liquidity, feeTier, balance0, balance1 };
  }
);
