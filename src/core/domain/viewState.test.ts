import { describe, expect, it } from "vitest";

import { createEmptyProject } from "./projectFactory";
import {
  projectWithViewport3dTargetAlignedToOriginIfDefault,
  viewport3dWithPlanOrbitTargetMm,
} from "./viewState";

describe("viewport3dWithPlanOrbitTargetMm", () => {
  it("обновляет только targetXMm/targetYMm", () => {
    const base = {
      polarAngle: 0.7,
      azimuthalAngle: 0.9,
      distance: 8000,
      targetXMm: 0,
      targetYMm: 0,
      targetZMm: 1500,
    };
    const next = viewport3dWithPlanOrbitTargetMm(base, { x: 12000, y: -3400 });
    expect(next).toEqual({
      ...base,
      targetXMm: 12000,
      targetYMm: -3400,
    });
  });
});

describe("projectWithViewport3dTargetAlignedToOriginIfDefault", () => {
  it("подставляет projectOrigin в target при «заводских» углах 3D", () => {
    const p0 = createEmptyProject();
    const p = { ...p0, projectOrigin: { x: 5000, y: -2000 } };
    const next = projectWithViewport3dTargetAlignedToOriginIfDefault(p);
    expect(next.viewState.viewport3d.targetXMm).toBe(5000);
    expect(next.viewState.viewport3d.targetYMm).toBe(-2000);
  });

  it("не трогает кастомный 3D-вид", () => {
    const p0 = createEmptyProject();
    const p = {
      ...p0,
      projectOrigin: { x: 5000, y: 0 },
      viewState: {
        ...p0.viewState,
        viewport3d: { ...p0.viewState.viewport3d, distance: 9000 },
      },
    };
    const next = projectWithViewport3dTargetAlignedToOriginIfDefault(p);
    expect(next.viewState.viewport3d.targetXMm).toBe(0);
  });
});
