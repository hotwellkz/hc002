import { describe, expect, it } from "vitest";

import { createDemoProject } from "../domain/demoProject";
import { createEmptyProject } from "../domain/projectFactory";
import { deserializeProject, serializeProject } from "./serialization";
import { projectFromWire, projectToWire } from "./projectWire";

describe("project serialization", () => {
  it("round-trip demo project", () => {
    const p = createDemoProject();
    const json = serializeProject(p);
    const back = deserializeProject(json);
    expect(projectToWire(back)).toEqual(projectToWire(p));
  });

  it("round-trip empty project", () => {
    const p = createEmptyProject();
    const back = deserializeProject(serializeProject(p));
    expect(back.meta.id).toBe(p.meta.id);
    expect(back.walls.length).toBe(0);
    expect(back.visibleLayerIds).toEqual([]);
  });

  it("reject bad json", () => {
    expect(() => deserializeProject("null")).toThrow();
  });

  it("projectFromWire enforces version", () => {
    const wire = projectToWire(createEmptyProject());
    const bad = { ...wire, schemaVersion: 99 };
    expect(() => projectFromWire(bad)).toThrow();
  });

  it("миграция v0: levels → layers, levelId → layerId", () => {
    const v0 = {
      schemaVersion: 0,
      id: "proj",
      name: "T",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
      units: "mm" as const,
      levels: [{ id: "lev1", name: "Э1", elevationMm: 0, order: 0 }],
      walls: [
        {
          id: "w1",
          levelId: "lev1",
          start: { x: 0, y: 0 },
          end: { x: 1000, y: 0 },
          thicknessMm: 100,
          heightMm: 2500,
        },
      ],
      openings: [],
      rooms: [],
      foundation: { type: "none" as const },
      roof: { slopes: [] },
      materialSet: { id: "m1", name: "M" },
      sheets: [],
      dimensions: [],
      settings: { gridStepMm: 100, showGrid: true },
      viewState: {
        activeTab: "2d" as const,
        viewport2d: { panXMm: 0, panYMm: 0, zoomPixelsPerMm: 0.1 },
        viewport3d: {
          polarAngle: 0,
          azimuthalAngle: 0,
          distance: 10000,
          targetXMm: 0,
          targetYMm: 0,
          targetZMm: 0,
        },
      },
    };
    const p = projectFromWire(v0);
    expect(p.meta.schemaVersion).toBe(2);
    expect(p.layers[0]?.name).toBe("Стены 1 эт");
    expect(p.walls[0]?.layerId).toBe("lev1");
    expect(p.activeLayerId).toBe("lev1");
  });
});
