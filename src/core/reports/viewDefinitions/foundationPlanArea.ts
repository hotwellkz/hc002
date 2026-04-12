import type { Point2D } from "../../geometry/types";
import { foundationStripOrthoRingAxisBoundsMm } from "../../domain/foundationStripGeometry";
import type { Project } from "../../domain/project";

/** Shoelace для одного контура (мм²), знак зависит от обхода. */
export function polygonSignedAreaMm2(loop: readonly Point2D[]): number {
  if (loop.length < 3) {
    return 0;
  }
  let s = 0;
  for (let i = 0; i < loop.length; i++) {
    const j = (i + 1) % loop.length;
    s += loop[i]!.x * loop[j]!.y - loop[j]!.x * loop[i]!.y;
  }
  return s / 2;
}

export function polygonAreaMm2(loop: readonly Point2D[]): number {
  return Math.abs(polygonSignedAreaMm2(loop));
}

/**
 * Площадь «двора» внутри ленты (по внутреннему контуру кольца).
 * Для ortho_ring — прямоугольник внутренней полости; для footprint_poly — площадь внешнего минус отверстия.
 */
export function computeFoundationInnerCourtyardAreaMm2(project: Project): number | null {
  let sum = 0;
  let any = false;

  for (const strip of project.foundationStrips) {
    if (strip.kind === "ortho_ring") {
      const { inner } = foundationStripOrthoRingAxisBoundsMm(strip);
      const w = inner.maxX - inner.minX;
      const h = inner.maxY - inner.minY;
      if (w > 1e-3 && h > 1e-3) {
        sum += w * h;
        any = true;
      }
    } else if (strip.kind === "footprint_poly") {
      const outerA = polygonAreaMm2(strip.outerRingMm);
      let holes = 0;
      for (const h of strip.holeRingsMm) {
        holes += polygonAreaMm2(h);
      }
      sum += Math.max(0, outerA - holes);
      any = true;
    }
  }

  return any ? sum : null;
}

/** Центр подписи площади — центр внутреннего прямоугольника первого ortho_ring или центроид outer footprint. */
export function innerCourtyardLabelCenterMm(project: Project): Point2D | null {
  for (const strip of project.foundationStrips) {
    if (strip.kind === "ortho_ring") {
      const { inner } = foundationStripOrthoRingAxisBoundsMm(strip);
      const w = inner.maxX - inner.minX;
      const h = inner.maxY - inner.minY;
      if (w > 1e-3 && h > 1e-3) {
        const cx = (inner.minX + inner.maxX) / 2;
        /** Нижняя зона внутреннего прямоугольника — дальше от диагонали углов и подписи диагонали. */
        const y = inner.minY + h * 0.3;
        return { x: cx, y };
      }
    }
    if (strip.kind === "footprint_poly" && strip.outerRingMm.length >= 3) {
      const ring = strip.outerRingMm;
      let cx = 0;
      let cy = 0;
      for (const p of ring) {
        cx += p.x;
        cy += p.y;
      }
      return { x: cx / ring.length, y: cy / ring.length };
    }
  }
  return null;
}
