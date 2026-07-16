import { createEffect, S } from "envio";
import {
  createPublicClient,
  http,
  getContract,
  type PublicClient,
  BaseError,
  HttpRequestError,
  TimeoutError,
} from "viem";
import { getChainConfig } from "./chains";
import { getStaticDefinition } from "./staticTokenDefinition";
import { isNullEthValue } from "./index";
import * as dotenv from "dotenv";

dotenv.config();

const ERC20_ABI = [
  {
    inputs: [],
    name: "name",
    outputs: [{ type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "NAME",
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "SYMBOL",
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const getRpcUrl = (chainId: number): string => {
  switch (chainId) {
    case 1:
      return process.env.ENVIO_MAINNET_RPC_URL || "https://eth.drpc.org";
    case 10:
      return process.env.ENVIO_OPTIMISM_RPC_URL || "https://optimism.drpc.org";
    case 42161:
      return process.env.ENVIO_ARBITRUM_RPC_URL || "https://arbitrum.drpc.org";
    case 8453:
      return process.env.ENVIO_BASE_RPC_URL || "https://base.drpc.org";
    case 137:
      return process.env.ENVIO_POLYGON_RPC_URL || "https://polygon.drpc.org";
    case 56:
      return process.env.ENVIO_BSC_RPC_URL || "https://bsc.drpc.org";
    case 43114:
      return (
        process.env.ENVIO_AVALANCHE_RPC_URL || "https://avalanche.drpc.org"
      );
    case 81457:
      return process.env.ENVIO_BLAST_RPC_URL || "https://blast.drpc.org";
    case 7777777:
      return process.env.ENVIO_ZORA_RPC_URL || "https://zora.drpc.org";
    case 480:
      return (
        process.env.ENVIO_WORLDCHAIN_RPC_URL || "https://worldchain.drpc.org"
      );
    case 130:
      return process.env.ENVIO_UNICHAIN_RPC_URL || "https://unichain.drpc.org";
    case 1868:
      return process.env.ENVIO_SONIEUM_RPC_URL || "https://soneium.drpc.org";
    case 57073:
      return process.env.ENVIO_INK_RPC_URL || "https://ink.drpc.org";
    case 59144:
      return process.env.ENVIO_LINEA_RPC_URL || "https://linea.drpc.org";
    case 42220:
      return process.env.ENVIO_CELO_RPC_URL || "https://celo.drpc.org";
    case 143:
      return process.env.ENVIO_MONAD_RPC_URL || "https://monad.drpc.org";
    default:
      throw new Error(`No RPC URL configured for chainId ${chainId}`);
  }
};

// Cache of clients per chainId
const clients: Record<number, PublicClient> = {};

export const getClient = (chainId: number): PublicClient => {
  if (!clients[chainId]) {
    clients[chainId] = createPublicClient({
      batch: {
        multicall: true,
      },
      transport: http(getRpcUrl(chainId), {
        batch: true,
        retryCount: 5,
        timeout: 30_000,
      }),
    });
  }
  return clients[chainId];
};

/**
 * Retry a thunk on transport-level errors (RPC down, rate limits, timeouts)
 * with exponential backoff. Reverts / missing functions are NOT transport
 * errors and propagate immediately — they carry the subgraph's semantics
 * ("this token has no decimals()"). Only after persistent transport failure
 * does the error escape, which stalls indexing rather than recording wrong
 * token properties.
 */
export async function withTransportRetry<T>(
  fn: () => Promise<T>,
  attempts = 8
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isTransportError(e)) throw e;
      lastError = e;
      const delayMs = Math.min(1000 * 2 ** attempt, 30_000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

// Remove null bytes and other control characters that break PostgreSQL
function sanitizeString(str: string): string {
  if (!str) return "";
  return str.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
}

function decodeBytes32(hex: string): string {
  return sanitizeString(
    new TextDecoder().decode(
      new Uint8Array(
        Buffer.from(hex.slice(2), "hex").filter((n) => n !== 0)
      )
    )
  );
}

/**
 * Distinguish transport-level failures (RPC down, timeouts) from contract
 * reverts / missing functions. The subgraph never mistakes an RPC outage for
 * "this token has no decimals()" — graph-node retries transport errors and
 * only try_* reverts flow into the null-decimals path. Mirror that: reverts
 * resolve to null (token genuinely lacks the method), transport errors are
 * rethrown so the effect fails, is NOT cached, and the batch is retried.
 */
function isTransportError(error: unknown): boolean {
  let e: unknown = error;
  while (e instanceof BaseError || (e instanceof Error && e.cause)) {
    if (e instanceof HttpRequestError || e instanceof TimeoutError) {
      return true;
    }
    e = (e as Error).cause;
  }
  return e instanceof HttpRequestError || e instanceof TimeoutError;
}

const catchRevert = <T>(promise: Promise<T>): Promise<T | null> =>
  promise.catch((e) => {
    if (isTransportError(e)) throw e;
    return null;
  });

// Create the token metadata effect.
//
// Semantics match the subgraph's src/common/token.ts:
// - static token definitions take priority over on-chain reads
// - symbol/name fall back to bytes32 variants, then "unknown"/"UNKNOWN"
// - decimals: null when unreadable or >= 255 (callers must then SKIP pool
//   creation, exactly like handlePoolCreated bails on null decimals)
// - totalSupply: 0 when unreadable
export const getTokenMetadataEffect = createEffect(
  {
    name: "getTokenMetadata",
    input: {
      address: S.string,
      chainId: S.number,
    },
    output: {
      name: S.string,
      symbol: S.string,
      decimals: S.nullable(S.number),
      totalSupply: S.bigint,
    },
    rateLimit: false,
    cache: true,
  },
  async ({ input, context }) => {
    const { address, chainId } = input;
    const normalizedAddress = address.toLowerCase();

    // Check for token overrides (subgraph STATIC_TOKEN_DEFINITIONS take
    // priority over contract reads). totalSupply is still read on-chain, but
    // never blocks metadata resolution.
    const chainConfig = getChainConfig(chainId);
    const staticDefinition = getStaticDefinition(
      normalizedAddress,
      chainConfig.tokenOverrides
    );

    const contract = getContract({
      address: address as `0x${string}`,
      abi: ERC20_ABI,
      client: getClient(chainId),
    });

    if (staticDefinition) {
      const staticTotalSupply = await withTransportRetry(() =>
        catchRevert(contract.read.totalSupply())
      );
      return {
        name: staticDefinition.name,
        symbol: staticDefinition.symbol,
        decimals: Number(staticDefinition.decimals),
        totalSupply: staticTotalSupply ?? 0n,
      };
    }

    const [
      nameResult,
      nameBytes32Result,
      symbolResult,
      symbolBytes32Result,
      decimalsResult,
      totalSupplyResult,
    ] = await withTransportRetry(() =>
      Promise.all([
        catchRevert(contract.read.name()),
        catchRevert(contract.read.NAME()),
        catchRevert(contract.read.symbol()),
        catchRevert(contract.read.SYMBOL()),
        catchRevert(contract.read.decimals()),
        catchRevert(contract.read.totalSupply()),
      ])
    );

    // Subgraph parity: the bytes32 fallbacks ignore the sentinel value
    // 0x…0001 (isNullEthValue) that broken tokens return.
    let name = "unknown";
    if (nameResult !== null) {
      name = sanitizeString(nameResult);
    } else if (nameBytes32Result !== null && !isNullEthValue(nameBytes32Result)) {
      name = decodeBytes32(nameBytes32Result);
    }

    let symbol = "UNKNOWN";
    if (symbolResult !== null) {
      symbol = sanitizeString(symbolResult);
    } else if (
      symbolBytes32Result !== null &&
      !isNullEthValue(symbolBytes32Result)
    ) {
      symbol = decodeBytes32(symbolBytes32Result);
    }

    // Subgraph: fetchTokenDecimals only accepts values < 255 and returns null
    // otherwise; null decimals means the pool is never indexed.
    const decimals =
      typeof decimalsResult === "number" && decimalsResult < 255
        ? decimalsResult
        : null;

    return {
      name: name || "unknown",
      symbol: symbol || "UNKNOWN",
      decimals,
      totalSupply: totalSupplyResult ?? 0n,
    };
  }
);
