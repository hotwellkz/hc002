import type { CoverCameraCorner } from "./coverCamera";

/** Длинная сторона PNG/JPEG для печати A4/A3 (пиксели). */
export const COVER_RENDER_LONG_SIDE_PX = 2400;

/** Соотношение сторон как у A4 альбомной страницы отчёта (297×210 мм). */
export const COVER_RENDER_ASPECT = 297 / 210;

/**
 * Размер буфера offscreen-рендера обложки (ширина × высота в пикселях).
 * Ширина соответствует длинной стороне листа альбомной ориентации.
 */
export function getCoverRenderPixelSize(): { readonly width: number; readonly height: number } {
  const w = COVER_RENDER_LONG_SIDE_PX;
  const h = Math.max(2, Math.round(w / COVER_RENDER_ASPECT));
  return { width: w, height: h };
}

/** Параметры снимка для хэша кэша и UI. */
export interface ProjectCoverRenderRequest {
  readonly corner: CoverCameraCorner;
  readonly backgroundKey: "white" | "light_gray" | "sky_light";
  /** Идентификатор проекта и отметка изменения (например meta.updatedAt). */
  readonly projectId: string;
  readonly projectUpdatedAt: string;
}

export function describeCoverRenderRequest(r: ProjectCoverRenderRequest): string {
  return `${r.projectId}|${r.projectUpdatedAt}|${r.corner}|${r.backgroundKey}`;
}
