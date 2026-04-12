import type { Project } from "../domain/project";
import { buildFoundationPlanWorld } from "./viewDefinitions/foundationPlan";
import {
  A4_LANDSCAPE_HEIGHT_MM,
  A4_LANDSCAPE_WIDTH_MM,
  a4LandscapeDrawingViewportMm,
  buildA4LandscapeChrome,
} from "./sheetTemplates/a4Landscape";
import type { ReportCompileParams, ReportDefinition, ReportPrimitive, ReportRenderModel } from "./types";
import { buildProjectCoverRenderModel } from "./viewDefinitions/projectCover3d";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function boundsOfPrimitives(primitives: readonly ReportPrimitive[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;

  const up = (x: number, y: number) => {
    any = true;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const p of primitives) {
    switch (p.kind) {
      case "line":
        up(p.x1Mm, p.y1Mm);
        up(p.x2Mm, p.y2Mm);
        break;
      case "polyline":
        for (const q of p.pointsMm) {
          up(q.x, q.y);
        }
        break;
      case "rect":
        up(p.xMm, p.yMm);
        up(p.xMm + p.widthMm, p.yMm + p.heightMm);
        break;
      case "text":
        up(p.xMm, p.yMm);
        break;
      case "dimensionLine":
        up(p.anchor1Xmm, p.anchor1Ymm);
        up(p.anchor2Xmm, p.anchor2Ymm);
        up(p.dimLineX1mm, p.dimLineY1mm);
        up(p.dimLineX2mm, p.dimLineY2mm);
        up(p.labelXmm, p.labelYmm);
        break;
      case "tableBlock":
        up(p.xMm, p.yMm);
        up(p.xMm + p.colWidthsMm.reduce((a, b) => a + b, 0), p.yMm + p.rowHeightsMm.reduce((a, b) => a + b, 0));
        break;
      case "image":
        up(p.xMm, p.yMm);
        up(p.xMm + p.widthMm, p.yMm + p.heightMm);
        break;
    }
  }
  return any ? { minX, minY, maxX, maxY } : null;
}

function transformPrimitive(p: ReportPrimitive, minX: number, maxY: number, s: number, ox: number, oyTop: number): ReportPrimitive {
  const mx = (wx: number, wy: number) => ({
    x: ox + (wx - minX) * s,
    y: oyTop + (maxY - wy) * s,
  });

  switch (p.kind) {
    case "line": {
      const a = mx(p.x1Mm, p.y1Mm);
      const b = mx(p.x2Mm, p.y2Mm);
      return {
        ...p,
        x1Mm: a.x,
        y1Mm: a.y,
        x2Mm: b.x,
        y2Mm: b.y,
        strokeMm: Math.max(0.12, p.strokeMm * s),
        dashMm: p.dashMm != null ? p.dashMm.map((d) => d * s) : undefined,
      };
    }
    case "polyline":
      return {
        ...p,
        pointsMm: p.pointsMm.map((q) => mx(q.x, q.y)),
        strokeMm: Math.max(0.12, p.strokeMm * s),
      };
    case "rect":
      return {
        ...p,
        xMm: mx(p.xMm, p.yMm + p.heightMm).x,
        yMm: mx(p.xMm, p.yMm + p.heightMm).y,
        widthMm: p.widthMm * s,
        heightMm: p.heightMm * s,
        strokeMm: p.strokeMm <= 1e-12 ? 0 : Math.max(0.12, p.strokeMm * s),
      };
    case "text":
      return {
        ...p,
        xMm: mx(p.xMm, p.yMm).x,
        yMm: mx(p.xMm, p.yMm).y,
        fontSizeMm: clamp(p.fontSizeMm * s, 1.45, 7),
      };
    case "dimensionLine": {
      const d1 = mx(p.dimLineX1mm, p.dimLineY1mm);
      const d2 = mx(p.dimLineX2mm, p.dimLineY2mm);
      const rdx = d2.x - d1.x;
      const rdy = d2.y - d1.y;
      const labelRotationDeg = (Math.atan2(rdy, rdx) * 180) / Math.PI;
      return {
        ...p,
        anchor1Xmm: mx(p.anchor1Xmm, p.anchor1Ymm).x,
        anchor1Ymm: mx(p.anchor1Xmm, p.anchor1Ymm).y,
        anchor2Xmm: mx(p.anchor2Xmm, p.anchor2Ymm).x,
        anchor2Ymm: mx(p.anchor2Xmm, p.anchor2Ymm).y,
        dimLineX1mm: d1.x,
        dimLineY1mm: d1.y,
        dimLineX2mm: d2.x,
        dimLineY2mm: d2.y,
        labelXmm: mx(p.labelXmm, p.labelYmm).x,
        labelYmm: mx(p.labelXmm, p.labelYmm).y,
        tickMm: Math.max(1.5, p.tickMm * s),
        centerGapMm: p.centerGapMm != null ? p.centerGapMm * s : undefined,
        strokeMm: p.strokeMm != null ? Math.max(0.05, p.strokeMm * s) : undefined,
        labelFontSizeMm:
          p.labelFontSizeMm != null ? clamp(p.labelFontSizeMm * s, 1.65, 7.15) : undefined,
        labelRotationDeg,
      };
    }
    case "tableBlock":
      return {
        ...p,
        xMm: mx(p.xMm, p.yMm).x,
        yMm: mx(p.xMm, p.yMm).y,
        colWidthsMm: p.colWidthsMm.map((w) => w * s),
        rowHeightsMm: p.rowHeightsMm.map((h) => h * s),
        fontSizeMm: clamp(p.fontSizeMm * s, 1.2, 4),
      };
    case "image":
      return {
        ...p,
        xMm: mx(p.xMm, p.yMm + p.heightMm).x,
        yMm: mx(p.xMm, p.yMm + p.heightMm).y,
        widthMm: p.widthMm * s,
        heightMm: p.heightMm * s,
      };
  }
}

/** Rect: world y is bottom edge (Y вверх). После преобразования — SVG с Y вниз: левый верхний угол. */
function transformRectWorldToSheet(
  p: Extract<ReportPrimitive, { kind: "rect" }>,
  minX: number,
  maxY: number,
  s: number,
  ox: number,
  oyTop: number,
): Extract<ReportPrimitive, { kind: "rect" }> {
  const topLeftW = { x: p.xMm, y: p.yMm + p.heightMm };
  const topLeftS = {
    x: ox + (topLeftW.x - minX) * s,
    y: oyTop + (maxY - topLeftW.y) * s,
  };
  return {
    ...p,
    xMm: topLeftS.x,
    yMm: topLeftS.y,
    widthMm: p.widthMm * s,
    heightMm: p.heightMm * s,
    strokeMm: p.strokeMm <= 1e-12 ? 0 : Math.max(0.12, p.strokeMm * s),
  };
}

function transformPrimitiveFixed(
  p: ReportPrimitive,
  minX: number,
  maxY: number,
  s: number,
  ox: number,
  oyTop: number,
): ReportPrimitive {
  if (p.kind === "rect") {
    return transformRectWorldToSheet(p, minX, maxY, s, ox, oyTop);
  }
  return transformPrimitive(p, minX, maxY, s, ox, oyTop);
}

function scaleTextFromDenominator(den: number): string {
  return `1 : ${den}`;
}

export function compileReport(
  project: Project,
  definition: ReportDefinition,
  params: ReportCompileParams,
): ReportRenderModel {
  const vp = a4LandscapeDrawingViewportMm();
  const messages: string[] = [];

  if (definition.implemented && definition.viewKind === "project_cover_3d") {
    return buildProjectCoverRenderModel(project, definition, params);
  }

  if (!definition.implemented) {
    const chrome = buildA4LandscapeChrome({
      projectName: project.meta.name,
      reportTitle: definition.title,
      scaleText: "—",
      dateText: params.reportDateIso.slice(0, 10),
      sheetLabel: `Лист ${params.sheetIndex}/${params.sheetCount}`,
    });
    const soon: ReportPrimitive = {
      kind: "text",
      xMm: vp.xMm + vp.widthMm / 2,
      yMm: vp.yMm + vp.heightMm / 2,
      text: "Скоро",
      fontSizeMm: 8,
      anchor: "middle",
    };
    return {
      templateId: definition.sheetTemplateId,
      pageWidthMm: A4_LANDSCAPE_WIDTH_MM,
      pageHeightMm: A4_LANDSCAPE_HEIGHT_MM,
      effectiveScaleDenominator: params.scaleDenominator,
      primitives: [...chrome, soon],
      messages: ["Отчёт ещё не реализован."],
    };
  }

  let worldPrimitives: readonly ReportPrimitive[] = [];
  if (definition.viewKind === "foundation_plan") {
    const built = buildFoundationPlanWorld(project);
    worldPrimitives = built.primitives;
    messages.push(...built.messages);
  } else {
    return {
      templateId: definition.sheetTemplateId,
      pageWidthMm: A4_LANDSCAPE_WIDTH_MM,
      pageHeightMm: A4_LANDSCAPE_HEIGHT_MM,
      effectiveScaleDenominator: params.scaleDenominator,
      primitives: [
        ...buildA4LandscapeChrome({
          projectName: project.meta.name,
          reportTitle: definition.title,
          scaleText: "—",
          dateText: params.reportDateIso.slice(0, 10),
          sheetLabel: `Лист ${params.sheetIndex}/${params.sheetCount}`,
        }),
        {
          kind: "text",
          xMm: vp.xMm + vp.widthMm / 2,
          yMm: vp.yMm + vp.heightMm / 2,
          text: "Вид не подключён",
          fontSizeMm: 4,
          anchor: "middle",
        },
      ],
      messages: [...messages, "Для этого отчёта ещё нет генератора вида."],
    };
  }

  const wb = boundsOfPrimitives(worldPrimitives);
  if (wb == null) {
    const chrome = buildA4LandscapeChrome({
      projectName: project.meta.name,
      reportTitle: definition.title,
      scaleText: scaleTextFromDenominator(params.scaleDenominator),
      dateText: params.reportDateIso.slice(0, 10),
      sheetLabel: `Лист ${params.sheetIndex}/${params.sheetCount}`,
    });
    const warn: ReportPrimitive = {
      kind: "text",
      xMm: vp.xMm + vp.widthMm / 2,
      yMm: vp.yMm + vp.heightMm / 2,
      text: "Нет данных для отчёта",
      fontSizeMm: 4,
      anchor: "middle",
    };
    return {
      templateId: definition.sheetTemplateId,
      pageWidthMm: A4_LANDSCAPE_WIDTH_MM,
      pageHeightMm: A4_LANDSCAPE_HEIGHT_MM,
      effectiveScaleDenominator: params.scaleDenominator,
      primitives: [...chrome, warn],
      messages: [...messages, "Нет геометрии для построения вида."],
    };
  }

  const cw = Math.max(1e-6, wb.maxX - wb.minX);
  const ch = Math.max(1e-6, wb.maxY - wb.minY);
  const s = Math.min(vp.widthMm / cw, vp.heightMm / ch) * 0.94;
  const effectiveDen = Math.max(1, Math.round(1 / s));
  const ox = vp.xMm + (vp.widthMm - cw * s) / 2;
  const oyTop = vp.yMm + (vp.heightMm - ch * s) / 2;

  const sheetContent = worldPrimitives.map((p) => transformPrimitiveFixed(p, wb.minX, wb.maxY, s, ox, oyTop));

  const chrome = buildA4LandscapeChrome({
    projectName: project.meta.name,
    reportTitle: definition.title,
    scaleText: `≈ ${scaleTextFromDenominator(effectiveDen)}`,
    dateText: params.reportDateIso.slice(0, 10),
    sheetLabel: `Лист ${params.sheetIndex}/${params.sheetCount}`,
  });

  return {
    templateId: definition.sheetTemplateId,
    pageWidthMm: A4_LANDSCAPE_WIDTH_MM,
    pageHeightMm: A4_LANDSCAPE_HEIGHT_MM,
    effectiveScaleDenominator: effectiveDen,
    primitives: [...chrome, ...sheetContent],
    messages,
  };
}
