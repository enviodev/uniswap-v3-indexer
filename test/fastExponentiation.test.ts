/**
 * fastExponentiation computes 1.0001^tick for Tick.price0. The subgraph uses
 * exact BigDecimal exponentiation-by-squaring; a float-based shortcut used to
 * live here ("not to be used in production") and silently shipped. These
 * tests pin the exact implementation: correct integer halving (bigint),
 * 40-digit precision caps (without them the ~20 squaring levels for extreme
 * ticks produce megabyte-size intermediates — see the v4 indexer's
 * fastExponentiation forensics), and sane performance.
 */
import { describe, it, expect } from "vitest";
import { BigDecimal } from "envio";
import { fastExponentiation, safeDiv } from "../src/handlers/utils/index";
import { ONE_BD } from "../src/handlers/utils/constants";

const BASE = new BigDecimal("1.0001");

// Real tick values observed via HyperSync Initialize events (v4 test corpus)
const REAL_TICKS = [
  0n, 167067n, 81289n, 230400n, 80067n, 46054n, -196257n, 276324n, 253297n,
  78999n, -276325n, 92108n, 69081n, 315446n, 23027n, -88194n, -197471n,
  232501n, 389635n, -414487n, -219066n, 244133n, 161189n, 331541n, 207243n,
  -141873n, 138162n, 253915n, 345405n, 191272n, 184216n, 282451n, -184217n,
  -138163n, -231325n, -483568n, 437513n, 476635n, 483567n, 329309n, -460541n,
  460540n, 373375n, 391459n, -267784n,
];

describe("fastExponentiation", () => {
  it("handles base cases", () => {
    expect(fastExponentiation(BASE, 0n).toString()).toBe("1");
    expect(fastExponentiation(BASE, 1n).toString()).toBe("1.0001");
  });

  it("is exact for small odd powers (regression: float version was wrong for odd powers)", () => {
    // 1.0001^3 = 1.000300030001 exactly
    expect(fastExponentiation(BASE, 3n).toFixed(12)).toBe("1.000300030001");
    // 1.0001^5 = 1.00050010001000050001 exactly (binomial expansion)
    expect(fastExponentiation(BASE, 5n).toFixed(20)).toBe(
      "1.00050010001000050001"
    );
  });

  it("inverts negative powers", () => {
    const p3 = fastExponentiation(BASE, 3n);
    const m3 = fastExponentiation(BASE, -3n);
    expect(m3.toFixed(20)).toBe(safeDiv(ONE_BD, p3).toFixed(20));
  });

  it("agrees with float math within float precision for a medium tick", () => {
    const tick = 194071n;
    const exact = fastExponentiation(BASE, tick);
    const approx = Math.pow(1.0001, Number(tick));
    const rel = exact.minus(new BigDecimal(approx.toString())).abs().div(exact);
    // float pow drifts ~2e-12 at this magnitude — the exact value is the
    // reference, the float only bounds the ballpark
    expect(rel.lt(new BigDecimal("1e-9"))).toBe(true);
  });

  it("handles the extreme tick bounds (±887272) without digit explosion", () => {
    const max = fastExponentiation(BASE, 887272n);
    const min = fastExponentiation(BASE, -887272n);
    // 1.0001^887272 ≈ 3.4e38, and the negative power is its reciprocal
    expect(max.gt(new BigDecimal("1e38"))).toBe(true);
    expect(max.lt(new BigDecimal("1e39"))).toBe(true);
    expect(min.gt(new BigDecimal("1e-39"))).toBe(true);
    expect(min.lt(new BigDecimal("1e-38"))).toBe(true);
  });

  it("computes the full real-tick corpus quickly", () => {
    const start = performance.now();
    for (const tick of REAL_TICKS) {
      fastExponentiation(BASE, tick);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });
});
