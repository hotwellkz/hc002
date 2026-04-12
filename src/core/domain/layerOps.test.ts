import { describe, expect, it } from "vitest";

import { createEmptyProject } from "./projectFactory";
import {
  createLayerInProject,
  deleteLayerAndEntities,
  canDeleteLayer,
  reorderLayerRelativeInDomain,
  sortLayersForDomain,
} from "./layerOps";
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

  it("createLayerInProject с domain создаёт слой раздела", () => {
    const p = createEmptyProject();
    const next = createLayerInProject(p, { name: "Крыша 1", elevationMm: 5000, domain: "roof" });
    const roof = next.layers.find((l) => l.name === "Крыша 1");
    expect(roof?.domain).toBe("roof");
  });

  it("reorderLayerRelativeInDomain меняет порядок только внутри раздела", () => {
    let p = createEmptyProject();
    p = createLayerInProject(p, { name: "Перекрытие A", elevationMm: 3000, domain: "slab" });
    p = createLayerInProject(p, { name: "Перекрытие B", elevationMm: 3200, domain: "slab" });
    const a = p.layers.find((l) => l.name === "Перекрытие A")!;
    const b = p.layers.find((l) => l.name === "Перекрытие B")!;
    const oa = a.orderIndex;
    const ob = b.orderIndex;
    const slab = sortLayersForDomain(p, "slab");
    expect(slab.map((l) => l.id)).toEqual([a.id, b.id]);
    const swapped = reorderLayerRelativeInDomain(p, b.id, "up");
    const a2 = swapped.layers.find((l) => l.id === a.id)!;
    const b2 = swapped.layers.find((l) => l.id === b.id)!;
    expect(a2.orderIndex).toBe(ob);
    expect(b2.orderIndex).toBe(oa);
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
