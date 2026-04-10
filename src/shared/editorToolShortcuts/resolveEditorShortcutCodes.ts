import type { EditorShortcutActionId } from "./editorShortcutActions";
import { EDITOR_SHORTCUT_ACTION_IDS, EDITOR_SHORTCUT_META } from "./editorShortcutActions";

/** `undefined` — взять дефолт; `null` — сочетание отключено; строка — один код. */
export type EditorShortcutCustomMap = Partial<Record<EditorShortcutActionId, string | null>>;

export function getResolvedShortcutCodes(
  actionId: EditorShortcutActionId,
  custom: EditorShortcutCustomMap,
): readonly string[] {
  const raw = custom[actionId];
  if (raw === null) {
    return [];
  }
  if (typeof raw === "string") {
    return raw.length > 0 ? [raw] : [];
  }
  return EDITOR_SHORTCUT_META[actionId].defaultCodes;
}

/** Код → список действий (для поиска конфликтов и обработки keydown). */
export function buildShortcutCodeIndex(custom: EditorShortcutCustomMap): Map<string, EditorShortcutActionId[]> {
  const map = new Map<string, EditorShortcutActionId[]>();
  for (const id of EDITOR_SHORTCUT_ACTION_IDS) {
    for (const code of getResolvedShortcutCodes(id, custom)) {
      const prev = map.get(code);
      if (prev) {
        prev.push(id);
      } else {
        map.set(code, [id]);
      }
    }
  }
  return map;
}

export function findActionsBoundToCode(
  code: string,
  custom: EditorShortcutCustomMap,
): readonly EditorShortcutActionId[] {
  const hit: EditorShortcutActionId[] = [];
  for (const id of EDITOR_SHORTCUT_ACTION_IDS) {
    if (getResolvedShortcutCodes(id, custom).includes(code)) {
      hit.push(id);
    }
  }
  return hit;
}
