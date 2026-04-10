import { frameGklDoorRoughAlongSpanMm } from "./frameGklDoorAlongGeometry";
import { normalizeLumberRole } from "./wallCalculation";
import { type LumberPieceDraftInput } from "./wallCalculationNormalize";
import { isOpeningPlacedOnWall, type Opening } from "./opening";

const EPS = 1e-3;

/**
 * Убирает обычные стойки каркаса (`framing_member_generic`) из светового проёма двери,
 * чтобы профиль не шёл «сквозь» дверь.
 *
 * @param clearOpeningAlongWall — для каркаса/ГКЛ: `widthMm` уже чистый проём, вырезаем по (o0…o1);
 * иначе (SIP): чистый проём между внутренними гранями стоек (o0+w…o1−w).
 */
export function filterFramingStudsClearOfDoorOpenings(
  drafts: readonly LumberPieceDraftInput[],
  doors: readonly Opening[],
  studWidthAlongWallMm: number,
  clearOpeningAlongWall = false,
): LumberPieceDraftInput[] {
  const ranges = doors
    .filter((o): o is Opening & { wallId: string; offsetFromStartMm: number } => o.kind === "door" && isOpeningPlacedOnWall(o))
    .map((o) => ({
      o0: o.offsetFromStartMm,
      o1: o.offsetFromStartMm + o.widthMm,
    }));
  if (ranges.length === 0) {
    return [...drafts];
  }
  const w = Math.max(EPS, studWidthAlongWallMm);
  return drafts.filter((d) => {
    if (normalizeLumberRole(String(d.role)) !== "framing_member_generic") {
      return true;
    }
    if (d.orientation !== "across_wall") {
      return true;
    }
    const lo = Math.min(d.startOffsetMm, d.endOffsetMm);
    const hi = Math.max(d.startOffsetMm, d.endOffsetMm);
    for (const { o0, o1 } of ranges) {
      const clearLo = clearOpeningAlongWall ? o0 : o0 + w;
      const clearHi = clearOpeningAlongWall ? o1 : o1 - w;
      if (clearHi <= clearLo + EPS) {
        continue;
      }
      const interLo = Math.max(lo, clearLo);
      const interHi = Math.min(hi, clearHi);
      if (interHi - interLo > EPS) {
        return false;
      }
    }
    return true;
  });
}

/**
 * ГКЛ/каркас: сетка стоек ставит вертикаль на границе листа (`roughLo` / `roughHi`), совпадающей
 * с полосой дверной стойки — получается два профиля подряд. Убираем лишние `framing_member_generic`,
 * центр которых попадает в полосу обкладки двери [roughLo…clearLeft] или [clearRight…roughHi].
 */
export function removeGkLFramingStudsOverlappingDoorJambs(
  drafts: readonly LumberPieceDraftInput[],
  doors: readonly Opening[],
  studThicknessAlongWallMm: number,
): LumberPieceDraftInput[] {
  const T = Math.max(EPS, studThicknessAlongWallMm);
  const strips: readonly { lo: number; hi: number }[] = doors
    .filter((o): o is Opening & { offsetFromStartMm: number } => o.kind === "door" && isOpeningPlacedOnWall(o))
    .map((o) => {
      const clearLeft = o.offsetFromStartMm;
      const clearRight = o.offsetFromStartMm + o.widthMm;
      const { roughLo, roughHi } = frameGklDoorRoughAlongSpanMm(clearLeft, o.widthMm, T);
      return [
        { lo: roughLo, hi: clearLeft },
        { lo: clearRight, hi: roughHi },
      ];
    })
    .flat();
  if (strips.length === 0) {
    return [...drafts];
  }
  return drafts.filter((d) => {
    if (normalizeLumberRole(String(d.role)) !== "framing_member_generic") {
      return true;
    }
    if (d.orientation !== "across_wall") {
      return true;
    }
    const lo = Math.min(d.startOffsetMm, d.endOffsetMm);
    const hi = Math.max(d.startOffsetMm, d.endOffsetMm);
    const cx = (lo + hi) / 2;
    for (const s of strips) {
      if (cx >= s.lo - EPS && cx <= s.hi + EPS) {
        return false;
      }
    }
    return true;
  });
}
