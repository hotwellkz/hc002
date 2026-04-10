import { describe, expect, it } from "vitest";

import { computeWallDetailOpeningLabelLayout } from "./wallDetailOpeningLabelLayout";

describe("computeWallDetailOpeningLabelLayout", () => {
  it("широкий проём в px — одна строка", () => {
    const L = computeWallDetailOpeningLabelLayout("OK_1", 1250, 1300, 180, 120);
    expect(L.mode).toBe("one");
    if (L.mode === "one") {
      expect(L.text).toContain("1250/1300");
    }
  });

  it("узкий проём в px — две строки (марка и размеры)", () => {
    const L = computeWallDetailOpeningLabelLayout("OK_2", 600, 600, 52, 90);
    expect(L.mode).toBe("two");
    if (L.mode === "two") {
      expect(L.line1).toBe("OK_2");
      expect(L.line2).toBe("600/600");
    }
  });
});
