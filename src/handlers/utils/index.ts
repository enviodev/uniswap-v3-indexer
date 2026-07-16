import { BigDecimal, Transaction } from "envio";
import { ZERO_BD, ONE_BD, ZERO_BI } from "./constants";

export function isAddressInList(address: string, list: string[]): boolean {
    address = address.toLowerCase();

    for (const item of list) {
        if (address === item.toLowerCase()) {
            return true;
        }
    }

    return false;
}

export function exponentToBigDecimal(decimals: bigint): BigDecimal {
    let resultString = "1";

    for (let i = 0n; i < decimals; i++) {
        resultString += "0";
    }

    return new BigDecimal(resultString);
}

// return 0 if denominator is 0 in division
export function safeDiv(amount0: BigDecimal, amount1: BigDecimal): BigDecimal {
    return amount1.eq(ZERO_BD) ? ZERO_BD : amount0.div(amount1);
}

// Cap BigDecimal precision at 40 decimal places. Postgres btree indexes have a
// hard 2704-byte-per-row limit, so an unbounded BigDecimal (e.g. from a runaway
// derivedETH on a manipulated oracle pool) can fail INSERTs on indexed numeric
// columns. Apply at indexed-column writes and at price-source values that
// propagate downstream (derivedETH, ethPriceUSD).
export function sanitizeBD(value: BigDecimal): BigDecimal {
    return new BigDecimal(value.toFixed(40));
}

/**
 * Implements exponentiation by squaring
 * (see https://en.wikipedia.org/wiki/Exponentiation_by_squaring )
 * to minimize the number of BigDecimal operations and their impact on performance.
 *
 * Caps intermediate precision at 40 digits to prevent BigDecimal digit
 * explosion during squaring steps (without capping, the ~20 squaring levels
 * for extreme ticks would produce megabyte-scale intermediates).
 */
export function fastExponentiation(
    value: BigDecimal,
    power: bigint
): BigDecimal {
    if (power < ZERO_BI) {
        const result = fastExponentiation(value, -power);
        return safeDiv(ONE_BD, result);
    }

    if (power === 0n) {
        return ONE_BD;
    }

    if (power === 1n) {
        return value;
    }

    const halfPower = power / 2n;
    const halfResult = fastExponentiation(value, halfPower);

    // Use the fact that x ^ (2n) = (x ^ n) * (x ^ n) and we can compute (x ^ n) only once.
    // Cap precision after each multiplication to prevent digit explosion.
    let result = new BigDecimal(halfResult.times(halfResult).toFixed(40));

    // For odd powers, x ^ (2n + 1) = (x ^ 2n) * x
    if (power % 2n === 1n) {
        result = new BigDecimal(result.times(value).toFixed(40));
    }

    return result;
}

export const NULL_ETH_HEX_STRING =
    "0x0000000000000000000000000000000000000000000000000000000000000001";

export function isNullEthValue(value: string): boolean {
    return value === NULL_ETH_HEX_STRING;
}

export function convertTokenToDecimal(
    tokenAmount: bigint,
    exchangeDecimals: bigint
): BigDecimal {
    const val = new BigDecimal(tokenAmount.toString());
    return (exchangeDecimals === ZERO_BI) ? val :
            val.div(exponentToBigDecimal(exchangeDecimals));
}

export async function loadTransaction(
    txHash: string,
    blockNumber: number,
    timestamp: number,
    gasPrice: bigint,
    context: any
): Promise<Transaction> {
    const txRO = await context.Transaction.get(txHash);
    const transaction = txRO ? {...txRO} :
                        {
                            id: txHash,
                            blockNumber: 0,
                            timestamp: 0,
                            gasUsed: ZERO_BI, //needs to be moved to transaction receipt
                            gasPrice: ZERO_BI
                        };

    transaction.blockNumber = blockNumber;
    transaction.timestamp = timestamp;
    transaction.gasUsed = ZERO_BI; //needs to be moved to transaction receipt
    transaction.gasPrice = gasPrice;

    context.Transaction.set(transaction as Transaction);
    return transaction as Transaction;
}
