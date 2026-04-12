import { newEntityId } from "./ids";
import type { Project } from "./project";
import { touchProjectMeta } from "./projectFactory";
import type { SlabEntity } from "./slab";
import type { Point2D } from "../geometry/types";

import { validateSlabDepthLevel, validateSlabPolygonMm } from "./slabPolygon";

export function createSlabFromPolygon(
  input: {
    readonly layerId: string;
    readonly pointsMm: readonly Point2D[];
    readonly levelMm: number;
    readonly depthMm: number;
    readonly structuralPurpose?: SlabEntity["structuralPurpose"];
    readonly nowIso?: string;
  },
): { readonly slab: SlabEntity } | { readonly error: string } {
  const v = validateSlabDepthLevel(input.depthMm, input.levelMm);
  if (!v.ok) {
    return { error: v.message };
  }
  const g = validateSlabPolygonMm(input.pointsMm);
  if (!g.ok) {
    return { error: g.message };
  }
  const t = input.nowIso ?? new Date().toISOString();
  const slab: SlabEntity = {
    id: newEntityId(),
    layerId: input.layerId,
    pointsMm: input.pointsMm.map((p) => ({ x: p.x, y: p.y })),
    levelMm: input.levelMm,
    depthMm: input.depthMm,
    ...(input.structuralPurpose != null ? { structuralPurpose: input.structuralPurpose } : {}),
    createdAt: t,
    updatedAt: t,
  };
  return { slab };
}

export function addSlabToProject(project: Project, slab: SlabEntity): Project {
  return touchProjectMeta({ ...project, slabs: [...project.slabs, slab] });
}

export function translateSlabsInProjectByIds(
  project: Project,
  slabIds: ReadonlySet<string>,
  dxMm: number,
  dyMm: number,
): Project {
  if (slabIds.size === 0) {
    return project;
  }
  const slabs = project.slabs.map((s) =>
    slabIds.has(s.id)
      ? {
          ...s,
          pointsMm: s.pointsMm.map((p) => ({ x: p.x + dxMm, y: p.y + dyMm })),
          updatedAt: new Date().toISOString(),
        }
      : s,
  );
  return touchProjectMeta({ ...project, slabs });
}

export function updateSlabInProject(
  project: Project,
  slabId: string,
  patch: { readonly depthMm?: number; readonly levelMm?: number },
): { readonly project: Project } | { readonly error: string } {
  const idx = project.slabs.findIndex((s) => s.id === slabId);
  if (idx < 0) {
    return { error: "Плита не найдена." };
  }
  const prev = project.slabs[idx]!;
  const depthMm = patch.depthMm ?? prev.depthMm;
  const levelMm = patch.levelMm ?? prev.levelMm;
  const v = validateSlabDepthLevel(depthMm, levelMm);
  if (!v.ok) {
    return { error: v.message };
  }
  const g = validateSlabPolygonMm(prev.pointsMm);
  if (!g.ok) {
    return { error: g.message };
  }
  const next: SlabEntity = {
    ...prev,
    depthMm,
    levelMm,
    updatedAt: new Date().toISOString(),
  };
  const slabs = [...project.slabs];
  slabs[idx] = next;
  return { project: touchProjectMeta({ ...project, slabs }) };
}

export function duplicateSlabInProject(project: Project, slabId: string): { readonly project: Project; readonly newSlabId: string } | { readonly error: string } {
  const src = project.slabs.find((s) => s.id === slabId);
  if (!src) {
    return { error: "Плита не найдена." };
  }
  const t = new Date().toISOString();
  const copy: SlabEntity = {
    ...src,
    id: newEntityId(),
    pointsMm: src.pointsMm.map((p) => ({ x: p.x, y: p.y })),
    createdAt: t,
    updatedAt: t,
  };
  return { project: touchProjectMeta({ ...project, slabs: [...project.slabs, copy] }), newSlabId: copy.id };
}
