import type { Opening } from "./opening";

export function openingSillLevelMm(opening: Opening): number {
  return opening.kind === "window" ? (opening.sillHeightMm ?? opening.position?.sillLevelMm ?? 900) : 0;
}

/**
 * Верх светового проёма / низ перемычки по оси стены (мм от низа стены), без искусственных сдвигов.
 * Согласовано с расчётом каркаса в sipWallLayout (`heightMm` двери до низа шапки проёма).
 * Для стен каркас/ГКЛ `widthMm` двери — ширина чистого проёма; стойки снаружи от неё по толщине профиля.
 */
export function openingTopLevelMmForShell(opening: Opening): number {
  const sill = openingSillLevelMm(opening);
  return sill + opening.heightMm;
}
