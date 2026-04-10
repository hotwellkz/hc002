/** Действия редактора, на которые вешаются горячие клавиши (физические коды `KeyboardEvent.code`). */
export const EDITOR_SHORTCUT_ACTION_IDS = [
  "toolSelect",
  "toolPan",
  "toolChangeLengthToggle",
  "toolRuler",
  "editSelectedObject",
  "deleteSelected",
  "editorReset",
] as const;

export type EditorShortcutActionId = (typeof EDITOR_SHORTCUT_ACTION_IDS)[number];

export interface EditorShortcutActionMeta {
  readonly label: string;
  /** Коды по умолчанию; для удаления — два кода (Delete и Backspace). */
  readonly defaultCodes: readonly string[];
  /** Если false — в UI не показываем переназначение (зарезервировано). */
  readonly remappable: boolean;
}

export const EDITOR_SHORTCUT_META: Record<EditorShortcutActionId, EditorShortcutActionMeta> = {
  toolSelect: { label: "Выделение", defaultCodes: ["KeyW"], remappable: true },
  toolPan: { label: "Панорама (перемещение вида)", defaultCodes: ["KeyG"], remappable: true },
  toolChangeLengthToggle: { label: "Изменение длины", defaultCodes: ["KeyL"], remappable: true },
  toolRuler: { label: "Линейка", defaultCodes: ["KeyR"], remappable: true },
  editSelectedObject: { label: "Редактировать выбранное", defaultCodes: ["KeyE"], remappable: true },
  deleteSelected: { label: "Удалить выбранное", defaultCodes: ["Delete", "Backspace"], remappable: true },
  editorReset: { label: "Отмена / сброс", defaultCodes: ["Escape"], remappable: true },
};
