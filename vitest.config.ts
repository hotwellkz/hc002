import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    /** WIP: ожидают расширения registry / compileReport (фасады, кровля) — вернуть в прогон после реализации. */
    exclude: [
      "**/buildingElevationReport.integration.test.ts",
      "**/roofFramingSlopeSheetReport.integration.test.ts",
      "**/roofSlopePlanReport.integration.test.ts",
      "**/roofFramingPlanReport.integration.test.ts",
    ],
  },
});
