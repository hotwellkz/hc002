import type { Project } from "@/core/domain/project";

import {
  A4_LANDSCAPE_HEIGHT_MM,
  A4_LANDSCAPE_WIDTH_MM,
  a4LandscapeDrawingViewportMm,
  a4LandscapeNotesRectMm,
  buildA4LandscapeChrome,
} from "../sheetTemplates/a4Landscape";
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

/**
 * Лист обложки: рамка/штамп как у технических отчётов, в области чертежа — растровое изображение.
 * Не используется для размеров (см. примечание внизу листа).
 */
export function buildProjectCoverRenderModel(
  project: Project,
  definition: ReportDefinition,
  params: ReportCompileParams,
): ReportRenderModel {
  const vp = a4LandscapeDrawingViewportMm();
  const messages: string[] = [
    "Презентационный лист: не использовать как источник размеров и производственных решений.",
  ];

  if (!hasDrawingContent(project)) {
    const chrome = buildA4LandscapeChrome({
      projectName: project.meta.name,
      reportTitle: params.coverSheetTitle ?? definition.title,
      scaleText: "не применяется",
      dateText: params.reportDateIso.slice(0, 10),
      sheetLabel: `Лист ${params.sheetIndex}/${params.sheetCount} · ${params.coverStampTag ?? "Обложка проекта"}`,
    });
    const warn: ReportPrimitive = {
      kind: "text",
      xMm: vp.xMm + vp.widthMm / 2,
      yMm: vp.yMm + vp.heightMm / 2,
      text: "Нет 3D-геометрии для обложки",
      fontSizeMm: 4,
      anchor: "middle",
    };
    return {
      templateId: definition.sheetTemplateId,
      pageWidthMm: A4_LANDSCAPE_WIDTH_MM,
      pageHeightMm: A4_LANDSCAPE_HEIGHT_MM,
      effectiveScaleDenominator: params.scaleDenominator,
      primitives: [...chrome, ...coverDisclaimerPrimitives(), warn],
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
    reportTitle: params.coverSheetTitle ?? definition.title,
    scaleText: "не применяется",
    dateText: params.reportDateIso.slice(0, 10),
    sheetLabel: `Лист ${params.sheetIndex}/${params.sheetCount} · ${params.coverStampTag ?? "Обложка проекта"}`,
  });

  const subtitle: ReportPrimitive = {
    kind: "text",
    xMm: vp.xMm + vp.widthMm / 2,
    yMm: vp.yMm + 3,
    text: params.coverSubtitle ?? "Общий вид дома (3D)",
    fontSizeMm: 2.65,
    anchor: "middle",
  };

  const content: ReportPrimitive[] = [subtitle];

  const href = params.coverImageHref;
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
    primitives: [...chrome, ...coverDisclaimerPrimitives(), ...content],
    messages,
  };
}

function coverDisclaimerPrimitives(): readonly ReportPrimitive[] {
  const notes = a4LandscapeNotesRectMm();
  return [
    {
      kind: "text",
      xMm: notes.xMm + 4,
      yMm: notes.yMm + 11,
      text: "Не для размеров и геометрической валидации. Технические листы строятся из модели без генеративных допущений.",
      fontSizeMm: 1.85,
      anchor: "start",
    },
  ];
}
