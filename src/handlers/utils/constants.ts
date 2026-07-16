import { BigDecimal } from "envio";

// bignumber.js (envio's BigDecimal) defaults to 20 decimal places for division
// results, which quantizes micro-prices to zero (e.g. 1/1e32 -> 0). graph-node
// keeps 34 *significant* digits, so the subgraph represents prices down to its
// exponent limits. Raise the division precision so token ratios spanning the
// full v3 sqrtPrice/decimals range survive; writes that could explode are
// capped separately via sanitizeBD (see utils/index.ts).
BigDecimal.config({ DECIMAL_PLACES: 77 });

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'

export const ZERO_BI = BigInt(0)
export const ONE_BI = BigInt(1)
export const ZERO_BD = BigDecimal('0')
export const ONE_BD = BigDecimal('1')
export const BI_18 = BigInt(18)
