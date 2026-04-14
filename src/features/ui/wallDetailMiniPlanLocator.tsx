import type { Project } from "@/core/domain/project";
import { layerIdsForSnapGeometry } from "@/core/geometry/snap2dPrimitives";

export interface WallDetailMiniPlanBoxMm {
  readonly x0: number;
  readonly y0: number;
  readonly sizeMm: number;
}

/**
 * Компактный план: контур стен (мир Y вверх → лист Y вниз), текущая стена выделена, стрелка с внешней стороны.
 */
export function WallDetailMiniPlanLocator({
  project,
  highlightWallId,
  box,
  sx,
  sy,
}: {
  readonly project: Project;
  readonly highlightWallId: string;
  readonly box: WallDetailMiniPlanBoxMm;
  readonly sx: (mm: number) => number;
  readonly sy: (mm: number) => number;
}) {
  const layerIds = layerIdsForSnapGeometry(project);
  const walls = project.walls.filter((w) => layerIds.has(w.layerId));
  const hw = walls.find((w) => w.id === highlightWallId);
  if (walls.length === 0 || hw == null) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    minY = Math.min(minY, w.start.y, w.end.y);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    maxY = Math.max(maxY, w.start.y, w.end.y);
  }
  const pad = 520;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const bw = Math.max(1e-6, maxX - minX);
  const bh = Math.max(1e-6, maxY - minY);
  const sBox = box.sizeMm / Math.max(bw, bh);
  const ox = box.x0 + (box.sizeMm - bw * sBox) / 2;
  const oy = box.y0 + (box.sizeMm - bh * sBox) / 2;

  /** Мир (Y↑) → мм листа (Y↓). */
  const toSheet = (x: number, y: number) => ({
    xs: ox + (x - minX) * sBox,
    ys: oy + (maxY - y) * sBox,
  });

  let mx = 0;
  let my = 0;
  for (const w of walls) {
    mx += (w.start.x + w.end.x) * 0.5;
    my += (w.start.y + w.end.y) * 0.5;
  }
  mx /= walls.length;
  my /= walls.length;

  const hx0 = hw.start.x;
  const hy0 = hw.start.y;
  const hx1 = hw.end.x;
  const hy1 = hw.end.y;
  const hmx = (hx0 + hx1) * 0.5;
  const hmy = (hy0 + hy1) * 0.5;
  const tdx = hx1 - hx0;
  const tdy = hy1 - hy0;
  const tlen = Math.hypot(tdx, tdy) || 1;
  const tx = tdx / tlen;
  const ty = tdy / tlen;
  let nx = -ty;
  let ny = tx;
  if (nx * (hmx - mx) + ny * (hmy - my) < 0) {
    nx = -nx;
    ny = -ny;
  }
  const gapMm = Math.max(hw.thicknessMm * 1.5, 220);
  const arrowLenMm = 2600;
  const ax0w = hmx + nx * (gapMm + arrowLenMm);
  const ay0w = hmy + ny * (gapMm + arrowLenMm);
  const ax1w = hmx + nx * gapMm;
  const ay1w = hmy + ny * gapMm;
  const a0 = toSheet(ax0w, ay0w);
  const a1 = toSheet(ax1w, ay1w);

  const fw = Math.max(1, sx(box.x0 + box.sizeMm) - sx(box.x0));
  const fh = Math.max(1, sy(box.y0 + box.sizeMm) - sy(box.y0));

  return (
    <g className="wd-mini-plan" pointerEvents="none">
      <rect x={sx(box.x0)} y={sy(box.y0)} width={fw} height={fh} className="wd-mini-plan-frame" />
      {walls.map((w) => {
        const hi = w.id === highlightWallId;
        const p0 = toSheet(w.start.x, w.start.y);
        const p1 = toSheet(w.end.x, w.end.y);
        return (
          <line
            key={w.id}
            x1={sx(p0.xs)}
            y1={sy(p0.ys)}
            x2={sx(p1.xs)}
            y2={sy(p1.ys)}
            className={hi ? "wd-mini-wall wd-mini-wall--hi" : "wd-mini-wall"}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      <line
        x1={sx(a0.xs)}
        y1={sy(a0.ys)}
        x2={sx(a1.xs)}
        y2={sy(a1.ys)}
        className="wd-mini-arrow"
        vectorEffect="non-scaling-stroke"
      />
      <polygon
        points={`${sx(a1.xs)},${sy(a1.ys)} ${sx(a1.xs - (a1.xs - a0.xs) * 0.12 - (a1.ys - a0.ys) * 0.06)},${sy(a1.ys - (a1.ys - a0.ys) * 0.12 + (a1.xs - a0.xs) * 0.06)} ${sx(a1.xs - (a1.xs - a0.xs) * 0.12 + (a1.ys - a0.ys) * 0.06)},${sy(a1.ys - (a1.ys - a0.ys) * 0.12 - (a1.xs - a0.xs) * 0.06)}`}
        className="wd-mini-arrow-head"
      />
    </g>
  );
}
