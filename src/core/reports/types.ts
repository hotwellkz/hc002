import type { Point2D } from "../geometry/types";
import type { ElevationCardinal } from "./geometry/elevation2d";

/** Статус готовности отчёта для дерева и панели предупреждений. */
export type ReportStatus = "ready" | "warning" | "blocked" | "soon";

/** Идентификатор шаблона листа. */
export type SheetTemplateId = "a4_landscape";

/** Параметры компиляции отчёта (не персистятся в модели на MVP). */
export interface ReportCompileParams {
  /** Номинальный масштаб «1 : N» для штампа (например 100 → 1:100). */
  readonly scaleDenominator: number;
  /** Дата для штампа (ISO или локальная строка). */
  readonly reportDateIso: string;
  /** Номер листа в пакете. */
  readonly sheetIndex: number;
  /** Всего листов в пакете. */
  readonly sheetCount: number;
  /** Обложка 3D: data URL изображения (PNG/JPEG). */
  readonly coverImageHref?: string | null;
  /** Заголовок в штампе (центр верхней части листа). */
  readonly coverSheetTitle?: string;
  /** Подзаголовок в области чертежа. */
  readonly coverSubtitle?: string;
  /** Короткая пометка в строке листа (штамп). */
  readonly coverStampTag?: string;
  /** Цветной фасад 3D: data URL снимка сцены. */
  readonly facadeColor3dImageHref?: string | null;
  /** Лист «Вид стены»: data URL растрового снимка. */
  readonly wallDetailSheetImageHref?: string | null;
}

export type ReportPrimitive =
  | ReportPrimLine
  | ReportPrimPolyline
  | ReportPrimRect
  | ReportPrimText
  | ReportPrimTextBlock
  | ReportPrimImage
  | ReportPrimDimensionLine
  | ReportPrimTableBlock;

/** Несколько строк с общим выравниванием (мир, мм, Y вверх до compileReport). */
export interface ReportPrimTextBlock {
  readonly kind: "textBlock";
  readonly xMm: number;
  readonly yMm: number;
  readonly lines: readonly string[];
  readonly fontSizeMm: number;
  /** Интервал по базовым линиям (мм). */
  readonly lineHeightMm: number;
  readonly anchor: "start" | "middle" | "end";
  readonly rotationDeg?: number;
}

/** Вставка растрового изображения в координатах листа (мм, Y вниз). */
export interface ReportPrimImage {
  readonly kind: "image";
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  /** Обычно data:image/png;base64,... */
  readonly href: string;
  readonly preserveAspectRatio?: string;
}

export interface ReportPrimLine {
  readonly kind: "line";
  readonly x1Mm: number;
  readonly y1Mm: number;
  readonly x2Mm: number;
  readonly y2Mm: number;
  readonly strokeMm: number;
  readonly dashMm?: readonly number[];
  /** Осевые вспомогательные линии (серые, не основной контур). */
  readonly muted?: boolean;
}

export interface ReportPrimPolyline {
  readonly kind: "polyline";
  readonly pointsMm: readonly Point2D[];
  readonly closed: boolean;
  readonly strokeMm: number;
  readonly fill?: string;
  readonly dashMm?: readonly number[];
  /** Светло-серый пунктир (внутренние вспомогательные контуры), без заливки. */
  readonly muted?: boolean;
}

export interface ReportPrimRect {
  readonly kind: "rect";
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly strokeMm: number;
  readonly fill?: string;
}

export interface ReportPrimText {
  readonly kind: "text";
  readonly xMm: number;
  readonly yMm: number;
  readonly text: string;
  readonly fontSizeMm: number;
  readonly anchor: "start" | "middle" | "end";
  /** Поворот подписи (градусы, лист Y вниз), как в 2D-подписях проёмов. */
  readonly rotationDeg?: number;
}

/** Размерная линия в координатах листа (мм). */
export interface ReportPrimDimensionLine {
  readonly kind: "dimensionLine";
  /** Точки на объекте (подошвы выносок). */
  readonly anchor1Xmm: number;
  readonly anchor1Ymm: number;
  readonly anchor2Xmm: number;
  readonly anchor2Ymm: number;
  /** Линия размера. */
  readonly dimLineX1mm: number;
  readonly dimLineY1mm: number;
  readonly dimLineX2mm: number;
  readonly dimLineY2mm: number;
  readonly labelXmm: number;
  readonly labelYmm: number;
  readonly label: string;
  readonly tickMm: number;
  /** Разрыв основной размерной линии по длине под подпись (мм), без перечёркивания текста. */
  readonly centerGapMm?: number;
  readonly strokeMm?: number;
  readonly labelFontSizeMm?: number;
  /**
   * Поворот подписи в градусах (лист, Y вниз): 0 — горизонтально; для вертикальных размеров обычно −90 или угол вдоль линии.
   * Не масштабируется при compileReport.
   */
  readonly labelRotationDeg?: number;
}

export interface ReportPrimTableBlock {
  readonly kind: "tableBlock";
  readonly xMm: number;
  readonly yMm: number;
  readonly colWidthsMm: readonly number[];
  readonly rowHeightsMm: readonly number[];
  readonly cells: readonly (readonly string[])[];
  readonly fontSizeMm: number;
}

/** Описание области чертежа внутри листа (мм). */
export interface ReportViewportRect {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

/** Единая модель для превью и PDF. */
export interface ReportRenderModel {
  readonly templateId: SheetTemplateId;
  readonly pageWidthMm: number;
  readonly pageHeightMm: number;
  /** Итоговый масштаб «1 : N», вычисленный при подгонке чертежа (для штампа). */
  readonly effectiveScaleDenominator: number;
  readonly primitives: readonly ReportPrimitive[];
  /** Подсказки и предупреждения для UI. */
  readonly messages: readonly string[];
}

export type ReportViewKind =
  | "foundation_plan"
  | "wall_plan"
  | "sip_starting_board_plan"
  | "project_cover_3d"
  | "facade_color_elevation"
  | "wall_detail_sheet"
  | "building_elevation"
  | "placeholder";

export interface ReportDefinition {
  readonly id: string;
  readonly groupId: string;
  /** Заголовок в дереве отчётов (если задан treeLabel — он предпочтительнее). */
  readonly title: string;
  /** Короткая подпись в дереве (например при длинном заголовке листа). */
  readonly treeLabel?: string;
  /**
   * Подгруппа внутри раздела (одинаковый ключ — общий подзаголовок перед пунктами).
   * Например «Стартовая доска» внутри «СТЕНЫ».
   */
  readonly subgroupKey?: string;
  /** Заголовок в штампе листа; по умолчанию — title. */
  readonly sheetStampTitle?: string;
  /** Если false — в дереве как «Скоро», без компиляции. */
  readonly implemented: boolean;
  readonly viewKind: ReportViewKind;
  readonly sheetTemplateId: SheetTemplateId;
  /** Для фасадных листов: направление камеры. */
  readonly elevationCardinal?: ElevationCardinal;
  /** Для листа «Вид стены»: id стены в проекте. */
  readonly wallId?: string | null;
}

export interface ExportBundleSection {
  readonly reportDefinitionId: string;
  readonly enabled: boolean;
  readonly order: number;
}

/** Пакет экспорта (MVP — один отчёт или пресет по умолчанию). */
export interface ExportBundle {
  readonly id: string;
  readonly title: string;
  readonly sections: readonly ExportBundleSection[];
}

export interface ReportReadiness {
  readonly status: ReportStatus;
  readonly messages: readonly string[];
}
