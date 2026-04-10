import type { SnapKind } from "../geometry/snap2d";
import type { Point2D } from "../geometry/types";
import type { Project } from "./project";

export type WallPlacementPhase =
  | "waitingOriginAndFirst"
  | "waitingFirstWallPoint"
  | "waitingSecondPoint";

export interface WallPlacementDraft {
  readonly profileId: string;
  readonly heightMm: number;
  readonly baseElevationMm: number;
  readonly thicknessMm: number;
}

export interface WallPlacementSession {
  readonly phase: WallPlacementPhase;
  readonly draft: WallPlacementDraft;
  /** После первого клика (начало сегмента стены), мм. */
  readonly firstPointMm: Point2D | null;
  /** Текущий конец preview при движении мыши, мм. */
  readonly previewEndMm: Point2D | null;
  /** Последняя сработавшая привязка при preview (для маркера и подсказки). */
  readonly lastSnapKind: SnapKind | null;
  /**
   * Гистерезис угловой привязки направления второй точки (шаг 45°).
   * null — нет активной защёлки.
   */
  readonly angleSnapLockedDeg: number | null;
}

export function initialWallPlacementPhase(project: Project): WallPlacementPhase {
  return project.projectOrigin == null ? "waitingOriginAndFirst" : "waitingFirstWallPoint";
}

export function wallPlacementHintMessage(phase: WallPlacementPhase): string {
  switch (phase) {
    case "waitingOriginAndFirst":
      return "Выберите первую точку";
    case "waitingFirstWallPoint":
      return "Выберите первую точку стены";
    case "waitingSecondPoint":
      return "Выберите вторую точку";
    default:
      return "";
  }
}
