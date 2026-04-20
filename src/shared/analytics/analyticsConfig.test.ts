import { describe, expect, it } from "vitest";

import { isValidGaMeasurementId, isValidYandexMetricaId } from "./analyticsConfig";

describe("isValidGaMeasurementId", () => {
  it("принимает корректные G-XXXXXXXX", () => {
    expect(isValidGaMeasurementId("G-AB12CD3")).toBe(true);
    expect(isValidGaMeasurementId("G-ABCDEF0123")).toBe(true);
  });

  it("отбрасывает пустые и неверные форматы", () => {
    expect(isValidGaMeasurementId("")).toBe(false);
    expect(isValidGaMeasurementId(undefined)).toBe(false);
    expect(isValidGaMeasurementId(null)).toBe(false);
    expect(isValidGaMeasurementId("UA-12345-1")).toBe(false);
    expect(isValidGaMeasurementId("g-abcdef")).toBe(false);
    expect(isValidGaMeasurementId("G-AB")).toBe(false);
  });
});

describe("isValidYandexMetricaId", () => {
  it("принимает 4–12 цифр", () => {
    expect(isValidYandexMetricaId("12345678")).toBe(true);
    expect(isValidYandexMetricaId("9999")).toBe(true);
  });

  it("отбрасывает пустые и нечисловые", () => {
    expect(isValidYandexMetricaId("")).toBe(false);
    expect(isValidYandexMetricaId(undefined)).toBe(false);
    expect(isValidYandexMetricaId(null)).toBe(false);
    expect(isValidYandexMetricaId("abc12345")).toBe(false);
    expect(isValidYandexMetricaId("12")).toBe(false);
  });
});
