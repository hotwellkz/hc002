import type { Project } from "@/core/domain/project";

import {
  A4_LANDSCAPE_HEIGHT_MM,
  A4_LANDSCAPE_WIDTH_MM,
  a4LandscapeDrawingViewportMm,
  a4LandscapeNotesRectMm,
  buildA4LandscapeChrome,
} from "../sheetTemplates/a4Landscape";
import type { ElevationCardinal } from "../geometry/elevation2d";
import type { ReportCompileParams, ReportDefinition, ReportPrimitive, ReportRenderModel } from "../types";

function hasDrawingContent(project: Project): boolean {
  return (
    project.walls.length > 0 ||
    project.slabs.length > 0 ||
    project.roofPlanes.length > 0 ||
    project.foundationStrips.length > 0 ||
    project.foundationPiles.length > 0 ||
    project.floorBeams.length > 0
  );
}

function subtitleForCardinal(c: ElevationCardinal): string {
  switch (c) {
    case "front":
      return "Фасад цветной — вид спереди";
    case "back":
      return "Фасад цветной — вид сзади";
    case "left":
      return "Фасад цветной — вид слева";
    case "right":
      return "Фасад цветной — вид справа";
    default: {
      const _e: never = c;
      return _e;
    }
  }
}

function facadeColorDisclaimerPrimitives(): readonly ReportPrimitive[] {
  const notes = a4LandscapeNotesRectMm();
  return [
    {
      kind: "text",
      xMm: notes.xMm + 4,
      yMm: notes.yMm + 11,
      text:
        "Презентационный вид: не использовать как источник размеров и производственных решений. Для геометрии — технические листы модели.",
      fontSizeMm: 1.85,
      anchor: "start",
    },
  ];
}

/**
 * Цветной ортогональный фасад из 3D-сцены (те же материалы, что и у обложки «3D вид дома»).
 */
export function buildFacadeColorElevationRenderModel(
  project: Project,
  definition: ReportDefinition,
  params: ReportCompileParams,
): ReportRenderModel {
  const vp = a4LandscapeDrawingViewportMm();
  const messages: string[] = [
    "Презентационный лист: не использовать как источник размеров и производственных решений.",
  ];

  const card = definition.elevationCardinal;
  if (card == null) {
    return {
      templateId: definition.sheetTemplateId,
      pageWidthMm: A4_LANDSCAPE_WIDTH_MM,
      pageHeightMm: A4_LANDSCAPE_HEIGHT_MM,
      effectiveScaleDenominator: params.scaleDenominator,
      primitives: [],
      messages: [...messages, "Внутренняя ошибка: нет elevationCardinal у цветного фасада."],
    };
  }

  if (!hasDrawingContent(project)) {
    const chrome = buildA4LandscapeChrome({
      projectName: project.meta.name,
      reportTitle: definition.sheetStampTitle ?? definition.title,
      scaleText: "не применяется",
      dateText: params.reportDateIso.slice(0, 10),
      sheetLabel: `Лист ${params.sheetIndex}/${params.sheetCount} · Фасад цветной`,
    });
    const warn: ReportPrimitive = {
      kind: "text",
      xMm: vp.xMm + vp.widthMm / 2,
      yMm: vp.yMm + vp.heightMm / 2,
      text: "Нет 3D-геометрии для фасада",
      fontSizeMm: 4,
      anchor: "middle",
    };
    return {
      templateId: definition.sheetTemplateId,
      pageWidthMm: A4_LANDSCAPE_WIDTH_MM,
      pageHeightMm: A4_LANDSCAPE_HEIGHT_MM,
      effectiveScaleDenominator: params.scaleDenominator,
      primitives: [...chrome, ...facadeColorDisclaimerPrimitives(), warn],
      messages: [...messages, "Добавьте стены или другие элементы модели."],
    };
  }

  const pad = 1.2;
  const imgX = vp.xMm + pad;
  const imgY = vp.yMm + pad;
  const imgW = vp.widthMm - 2 * pad;
  const imgH = vp.heightMm - 2 * pad;

  const chrome = buildA4LandscapeChrome({
    projectName: project.meta.name,
    reportTitle: definition.sheetStampTitle ?? definition.title,
    scaleText: "не применяется",
    dateText: params.reportDateIso.slice(0, 10),
    sheetLabel: `Лист ${params.sheetIndex}/${params.sheetCount} · Фасад цветной`,
  });

  const subtitle: ReportPrimitive = {
    kind: "text",
    xMm: vp.xMm + vp.widthMm / 2,
    yMm: vp.yMm + 3,
    text: subtitleForCardinal(card),
    fontSizeMm: 2.65,
    anchor: "middle",
  };

  const content: ReportPrimitive[] = [subtitle];

  const href = params.facadeColor3dImageHref;
  if (href != null && href.length > 0) {
    content.push({
      kind: "image",
      xMm: imgX,
      yMm: imgY,
      widthMm: imgW,
      heightMm: imgH,
      href,
      preserveAspectRatio: "xMidYMid slice",
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
      text: "Нажмите «Пересчитать рендер»",
      fontSizeMm: 3.2,
      anchor: "middle",
    });
  }

  return {
    templateId: definition.sheetTemplateId,
    pageWidthMm: A4_LANDSCAPE_WIDTH_MM,
    pageHeightMm: A4_LANDSCAPE_HEIGHT_MM,
    effectiveScaleDenominator: params.scaleDenominator,
    primitives: [...chrome, ...facadeColorDisclaimerPrimitives(), ...content],
    messages,
  };
}
