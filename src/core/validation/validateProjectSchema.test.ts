import { describe, expect, it } from "vitest";

import { createDemoProject } from "../domain/demoProject";
import { createEmptyProject } from "../domain/projectFactory";
import { projectToWire } from "../io/projectWire";
import { validateProjectSchema, validateProjectWireJson } from "./validateProjectSchema";

describe("schema validation", () => {
  it("accepts empty and demo projects", () => {
    expect(validateProjectSchema(createEmptyProject()).ok).toBe(true);
    expect(validateProjectSchema(createDemoProject()).ok).toBe(true);
  });

  it("rejects invalid wire", () => {
    const wire = projectToWire(createEmptyProject());
    const bad = { ...wire, units: "m" };
    expect(validateProjectWireJson(bad).ok).toBe(false);
  });
});
