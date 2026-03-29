import type { LinearProfilePlacementMode } from "../geometry/linearPlacementGeometry";

import type { WallShapeMode } from "./wallShapeMode";

/** Настройки 2D-редактора, сохраняемые в проекте. */
export interface Editor2dSettings {
  /** Привязка линейных элементов (стена и др.) к траектории построения. */
  readonly linearPlacementMode: LinearProfilePlacementMode;
  /** Линия (одна стена) или прямоугольник (четыре стены). */
  readonly wallShapeMode: WallShapeMode;
}

/** Настройки проекта (в т.ч. редактор), сериализуются в snapshot. */
export interface ProjectSettings {
  readonly gridStepMm: number;
  readonly showGrid: boolean;
  readonly editor2d: Editor2dSettings;
}

/** Для загрузки старых файлов без editor2d. */
export type ProjectSettingsWire = Omit<ProjectSettings, "editor2d"> & { readonly editor2d?: Editor2dSettings };

export function normalizeProjectSettings(s: ProjectSettingsWire): ProjectSettings {
  const mode = s.editor2d?.linearPlacementMode;
  const linearPlacementMode: LinearProfilePlacementMode =
    mode === "leftEdge" || mode === "rightEdge" || mode === "center" ? mode : "center";
  const wallShapeMode: WallShapeMode = s.editor2d?.wallShapeMode === "rectangle" ? "rectangle" : "line";
  return {
    gridStepMm: s.gridStepMm,
    showGrid: s.showGrid,
    editor2d: { linearPlacementMode, wallShapeMode },
  };
}
