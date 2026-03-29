import type { LinearProfilePlacementMode } from "../geometry/linearPlacementGeometry";
import { computeWallCenterlineFromReferenceLine } from "../geometry/linearPlacementGeometry";
import {
  adjustedRectForRectanglePlacement,
  axisAlignedRectFromCorners,
  fourWallCenterSegmentsFromRect,
} from "../geometry/rectangleWallGeometry";
import type { Point2D } from "../geometry/types";
import { getProfileById } from "./profileOps";
import type { Project } from "./project";
import { addWallsToProject, createWallEntity } from "./wallOps";
import type { Wall } from "./wall";
import type { WallPlacementDraft, WallPlacementSession } from "./wallPlacement";
import type { WallShapeMode } from "./wallShapeMode";
import { newEntityId } from "./ids";

export interface WallPlacementCommitOk {
  readonly project: Project;
  readonly createdWallIds: readonly string[];
}

export interface WallPlacementCommitErr {
  readonly error: string;
}

export type WallPlacementCommitResult = WallPlacementCommitOk | WallPlacementCommitErr;

/**
 * Завершение второй точки: одна стена (линия) или четыре (прямоугольник).
 */
export function commitWallPlacementSecondPoint(
  project: Project,
  session: WallPlacementSession,
  draft: WallPlacementDraft,
  wallShapeMode: WallShapeMode,
  placementMode: LinearProfilePlacementMode,
  secondPointSnapped: Point2D,
): WallPlacementCommitResult {
  const first = session.firstPointMm;
  if (!first) {
    return { error: "Нет первой точки." };
  }
  const profile = getProfileById(project, draft.profileId);
  if (!profile) {
    return { error: "Профиль не найден — стена не создана." };
  }

  if (wallShapeMode === "line") {
    const frame = computeWallCenterlineFromReferenceLine(first, secondPointSnapped, draft.thicknessMm, placementMode);
    if (!frame) {
      return { error: "Не удалось вычислить ось стены (нулевая длина или толщина)." };
    }
    const wall = createWallEntity({
      layerId: project.activeLayerId,
      profileId: draft.profileId,
      start: frame.centerStart,
      end: frame.centerEnd,
      thicknessMm: draft.thicknessMm,
      heightMm: draft.heightMm,
      baseElevationMm: draft.baseElevationMm,
    });
    if (!wall) {
      return { error: "Слишком короткий сегмент — выберите вторую точку дальше." };
    }
    const next = addWallsToProject(project, [wall]);
    return { project: next, createdWallIds: [wall.id] };
  }

  const refRect = axisAlignedRectFromCorners(first, secondPointSnapped);
  const w = refRect.maxX - refRect.minX;
  const h = refRect.maxY - refRect.minY;
  if (w < 1e-6 || h < 1e-6) {
    return { error: "Прямоугольник вырожденный — задайте ненулевую ширину и высоту." };
  }

  const adjusted = adjustedRectForRectanglePlacement(refRect, draft.thicknessMm, placementMode);
  if (!adjusted) {
    return {
      error:
        placementMode === "leftEdge"
          ? "Для режима «внутрь» прямоугольник слишком мал относительно толщины стены."
          : "Не удалось построить контур стен.",
    };
  }

  const segs = fourWallCenterSegmentsFromRect(adjusted);
  const groupId = newEntityId();
  const walls: Wall[] = [];
  for (const seg of segs) {
    const wall = createWallEntity({
      layerId: project.activeLayerId,
      profileId: draft.profileId,
      start: seg.start,
      end: seg.end,
      thicknessMm: draft.thicknessMm,
      heightMm: draft.heightMm,
      baseElevationMm: draft.baseElevationMm,
      placementGroupId: groupId,
    });
    if (!wall) {
      return { error: "Один из сегментов контура слишком короткий." };
    }
    walls.push(wall);
  }

  const next = addWallsToProject(project, walls);
  return { project: next, createdWallIds: walls.map((w) => w.id) };
}
