import { describe, expect, it } from "vitest";

import { createEmptyProject } from "./projectFactory";
import { createLayerInProject, deleteLayerAndEntities, canDeleteLayer } from "./layerOps";
import { normalizeVisibleLayerIds, setVisibleLayerIdsOnProject } from "./layerVisibility";

describe("layerOps", () => {
  it("createLayerInProject делает новый слой активным", () => {
    const p = createEmptyProject();
    const next = createLayerInProject(p, { name: "L2", elevationMm: 3000 });
    expect(next.layers.length).toBe(2);
    expect(next.activeLayerId).toBe(next.layers[next.layers.length - 1]?.id);
  });

  it("нельзя удалить последний слой", () => {
    const p = createEmptyProject();
    expect(canDeleteLayer(p)).toBe(false);
    expect(deleteLayerAndEntities(p, p.activeLayerId)).toBeNull();
  });

  it("удаление слоя убирает его из visibleLayerIds", () => {
    const p0 = createEmptyProject();
    const firstId = p0.activeLayerId;
    const p1 = createLayerInProject(p0, { name: "L2", elevationMm: 3000 });
    const p2 = setVisibleLayerIdsOnProject(p1, [firstId]);
    expect(normalizeVisibleLayerIds(p2)).toContain(firstId);
    const next = deleteLayerAndEntities(p2, firstId);
    expect(next).not.toBeNull();
    expect(next!.visibleLayerIds.includes(firstId)).toBe(false);
  });
});
