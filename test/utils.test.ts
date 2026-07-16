import { describe, it, expect } from "vitest";
import { BigDecimal } from "envio";
import {
  convertTokenToDecimal,
  exponentToBigDecimal,
  safeDiv,
  sanitizeBD,
  isAddressInList,
} from "../src/handlers/utils/index";
import { ZERO_BD } from "../src/handlers/utils/constants";

const bd = (v: string | number) => new BigDecimal(v.toString());

describe("exponentToBigDecimal", () => {
  it("builds powers of ten", () => {
    expect(exponentToBigDecimal(0n).toString()).toBe("1");
    expect(exponentToBigDecimal(6n).toString()).toBe("1000000");
    expect(exponentToBigDecimal(18n).toString()).toBe("1000000000000000000");
  });
});

describe("safeDiv", () => {
  it("divides normally", () => {
    expect(safeDiv(bd(10), bd(4)).toString()).toBe("2.5");
  });

  it("returns 0 on division by zero (subgraph parity)", () => {
    expect(safeDiv(bd(10), ZERO_BD).toString()).toBe("0");
  });
});

describe("convertTokenToDecimal", () => {
  it("converts raw USDC (6 decimals) exactly", () => {
    expect(convertTokenToDecimal(77505140556n, 6n).toString()).toBe(
      "77505.140556"
    );
  });

  it("converts raw WETH (18 decimals) exactly", () => {
    expect(convertTokenToDecimal(20824112148200096620n, 18n).toString()).toBe(
      "20.82411214820009662"
    );
  });

  it("keeps 0-decimals amounts raw", () => {
    expect(convertTokenToDecimal(12345n, 0n).toString()).toBe("12345");
  });

  it("preserves full precision below 1e-4 (regression: used to round to 4dp)", () => {
    // 1 wei of an 18-decimals token
    expect(convertTokenToDecimal(1n, 18n).toString()).toBe("1e-18");
    // a dust WBTC amount (8 decimals)
    expect(convertTokenToDecimal(123n, 8n).toString()).toBe("0.00000123");
  });
});

describe("BigDecimal division precision (global config)", () => {
  it("does not zero micro-quotients (regression: default 20dp quantized 1/1e32 to 0)", () => {
    const q = bd(1).div(bd("1e32"));
    expect(q.isZero()).toBe(false);
    expect(q.toString()).toBe("1e-32");
  });

  it("covers the full v3 price range (MIN_SQRT_RATIO with extreme decimal skew)", () => {
    // price1 at MIN_SQRT_RATIO with token0 6dp / token1 18dp ≈ 2.9e-51
    const minSqrt = 4295128739n;
    const ratio = bd((minSqrt * minSqrt).toString()).div(
      bd((2n ** 192n).toString())
    );
    const price1 = ratio.times(bd("1e6")).div(bd("1e18"));
    expect(price1.isZero()).toBe(false);
  });
});

describe("sanitizeBD", () => {
  it("caps decimal places at 40 for pg btree safety", () => {
    const tiny = bd("1e-77");
    expect(sanitizeBD(tiny).isZero()).toBe(true);
    const fine = bd("1.5e-40");
    expect(sanitizeBD(fine).isZero()).toBe(false);
  });

  it("preserves normal-magnitude values", () => {
    expect(sanitizeBD(bd("3732.123456")).toString()).toBe("3732.123456");
  });
});

describe("isAddressInList", () => {
  it("is case-insensitive", () => {
    expect(
      isAddressInList("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", [
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      ])
    ).toBe(true);
  });

  it("misses absent addresses", () => {
    expect(
      isAddressInList("0x0000000000000000000000000000000000000001", [
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      ])
    ).toBe(false);
  });
});
