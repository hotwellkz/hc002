import type { Project } from "@/core/domain/project";

import {
  A4_LANDSCAPE_HEIGHT_MM,
  A4_LANDSCAPE_WIDTH_MM,
  a4LandscapeDrawingViewportMm,
  buildA4LandscapeChrome,
} from "../sheetTemplates/a4Landscape";
import type { ReportCompileParams, ReportDefinition, ReportPrimitive, ReportRenderModel } from "../types";

import { wallMarkLabelForDisplay } from "@/core/domain/pieceDisplayMark";

/**
 * Лист отчёта: растровый снимок вкладки «Вид стены» (те же SVG+стили) без вида сверху, с мини-планом.
 */
export function buildWallDetailSheetReportRenderModel(
  project: Project,
  definition: ReportDefinition,
  params: ReportCompileParams,
): ReportRenderModel {
  const vp = a4LandscapeDrawingViewportMm();
  const wid = definition.wallId;
  if (wid == null || wid.length === 0) {
    return {
      templateId: definition.sheetTemplateId,
      pageWidthMm: A4_LANDSCAPE_WIDTH_MM,
      pageHeightMm: A4_LANDSCAPE_HEIGHT_MM,
      effectiveScaleDenominator: params.scaleDenominator,
      primitives: [],
      messages: ["Внутренняя ошибка: нет wallId у листа «Вид стены»."],
    };
  }

  const wall = project.walls.find((w) => w.id === wid) ?? null;
  const title = definition.sheetStampTitle ?? definition.title;
  const messages: string[] = [];

  if (wall == null) {
    const chrome = buildA4LandscapeChrome({
      projectName: project.meta.name,
      reportTitle: title,
      scaleText: "—",
      dateText: params.reportDateIso.slice(0, 10),
      sheetLabel: `Лист ${params.sheetIndex}/${params.sheetCount}`,
    });
    const warn: ReportPrimitive = {
      kind: "text",
      xMm: vp.xMm + vp.widthMm / 2,
      yMm: vp.yMm + vp.heightMm / 2,
      text: "Стена удалена или недоступна",
      fontSizeMm: 4,
      anchor: "middle",
    };
    return {
      templateId: definition.sheetTemplateId,
      pageWidthMm: A4_LANDSCAPE_WIDTH_MM,
      pageHeightMm: A4_LANDSCAPE_HEIGHT_MM,
      effectiveScaleDenominator: params.scaleDenominator,
      primitives: [...chrome, warn],
      messages: [...messages, "Стена не найдена в проекте."],
    };
  }

  const pad = 1.2;
  const imgX = vp.xMm + pad;
  const imgY = vp.yMm + pad;
  const imgW = vp.widthMm - 2 * pad;
  const imgH = vp.heightMm - 2 * pad;

  const chrome = buildA4LandscapeChrome({
    projectName: project.meta.name,
    reportTitle: title,
    scaleText: "как на экране",
    dateText: params.reportDateIso.slice(0, 10),
    sheetLabel: `Лист ${params.sheetIndex}/${params.sheetCount}`,
  });

  const wallTitle = wall.markLabel?.trim() || wallMarkLabelForDisplay(wall.markLabel, wall.id.slice(0, 8));
  const subtitle: ReportPrimitive = {
    kind: "text",
    xMm: vp.xMm + vp.widthMm / 2,
    yMm: vp.yMm + 3,
    text: `Вид стены — ${wallTitle}`,
    fontSizeMm: 2.65,
    anchor: "middle",
  };

  const href = params.wallDetailSheetImageHref;
  const content: ReportPrimitive[] = [subtitle];

  if (href != null && href.length > 0) {
    content.push({
      kind: "image",
      xMm: imgX,
      yMm: imgY,
      widthMm: imgW,
      heightMm: imgH,
      href,
      preserveAspectRatio: "xMidYMid meet",
    });
  } else {
    content.push({
      kind: "rect",
      xMm: imgX,
      yMm: imgY,
      widthMm: imgW,
      heightMm: imgH,
      strokeMm: 0.2,
      fill: "#f3f4f6",
    });
    content.push({
      kind: "text",
      xMm: vp.xMm + vp.widthMm / 2,
      yMm: vp.yMm + vp.heightMm / 2,
      text: "Ожидание снимка листа…",
      fontSizeMm: 3.2,
      anchor: "middle",
    });
  }

  return {
    templateId: definition.sheetTemplateId,
    pageWidthMm: A4_LANDSCAPE_WIDTH_MM,
    pageHeightMm: A4_LANDSCAPE_HEIGHT_MM,
    effectiveScaleDenominator: params.scaleDenominator,
    primitives: [...chrome, ...content],
    messages,
  };
}
