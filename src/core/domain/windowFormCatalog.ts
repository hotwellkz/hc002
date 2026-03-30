/** Ключи формы проёма (этап 1 — только прямоугольник). */
export type WindowFormKey = "rectangle";

/** Пресет «вида окна» (схема импостов в превью). */
export type WindowViewPresetKey =
  | "form1"
  | "form2"
  | "form3"
  | "form4"
  | "form5"
  | "form6"
  | "form7"
  | "form8"
  | "form9";

export interface WindowFormOption {
  readonly key: WindowFormKey;
  readonly name: string;
}

export const WINDOW_FORM_OPTIONS: readonly WindowFormOption[] = [{ key: "rectangle", name: "Прямоугольник" }];

export interface WindowViewPresetOption {
  readonly key: WindowViewPresetKey;
  readonly label: string;
  /** Идентификатор схемы линий в превью (см. WindowFormPreview). */
  readonly previewVariant: number;
}

export const WINDOW_VIEW_PRESETS: readonly WindowViewPresetOption[] = [
  { key: "form1", label: "Форма 1", previewVariant: 1 },
  { key: "form2", label: "Форма 2", previewVariant: 2 },
  { key: "form3", label: "Форма 3", previewVariant: 3 },
  { key: "form4", label: "Форма 4", previewVariant: 4 },
  { key: "form5", label: "Форма 5", previewVariant: 5 },
  { key: "form6", label: "Форма 6", previewVariant: 6 },
  { key: "form7", label: "Форма 7", previewVariant: 7 },
  { key: "form8", label: "Форма 8", previewVariant: 8 },
  { key: "form9", label: "Форма 9", previewVariant: 9 },
];

export const DEFAULT_WINDOW_FORM_KEY: WindowFormKey = "rectangle";
export const DEFAULT_WINDOW_WIDTH_MM = 1250;
export const DEFAULT_WINDOW_HEIGHT_MM = 1300;
export const DEFAULT_SILL_OVERHANG_MM = 50;
export const DEFAULT_VIEW_PRESET_KEY: WindowViewPresetKey = "form1";

export function windowFormName(key: WindowFormKey): string {
  return WINDOW_FORM_OPTIONS.find((o) => o.key === key)?.name ?? "Прямоугольник";
}

export function viewPresetByKey(key: WindowViewPresetKey): WindowViewPresetOption | undefined {
  return WINDOW_VIEW_PRESETS.find((p) => p.key === key);
}
