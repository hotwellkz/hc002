/**
 * Редактирование числа в live-HUD (X/Y/D): строковый буфер до Enter, знак только в начале.
 */

export function sanitizeSignedNumericHudDraft(prev: string, nextRaw: string): string {
  let s = nextRaw.replace(/,/g, ".");
  if (s === "" || s === "-") {
    return s;
  }
  if (s === ".") {
    return "0.";
  }
  if (s === "-.") {
    return "-0.";
  }
  const neg = s.startsWith("-");
  let t = neg ? s.slice(1) : s;
  t = t.replace(/[^\d.]/g, "");
  const parts = t.split(".");
  if (parts.length > 2) {
    t = parts[0]! + "." + parts.slice(1).join("");
  }
  s = neg ? `-${t}` : t;
  if (s !== "-" && s !== "-0." && !/^-?\d*\.?\d*$/.test(s)) {
    return prev;
  }
  return s;
}

/** Парсинг после Enter; `null` — не применять. */
export function parseSignedHudDraftMm(draft: string): number | null {
  const t = draft.trim().replace(",", ".");
  if (t === "" || t === "-" || t === "." || t === "-.") {
    return null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Физические клавиши (раскладка не важна). */
export function liveHudAxisFieldFromKeyEvent(e: KeyboardEvent): "x" | "y" | null {
  if (e.code === "KeyY") {
    return "y";
  }
  if (e.code === "KeyX") {
    return "x";
  }
  const k = e.key;
  if (k === "y" || k === "Y" || k === "н" || k === "Н") {
    return "y";
  }
  if (k === "x" || k === "X" || k === "ч" || k === "Ч") {
    return "x";
  }
  return null;
}

export function liveHudIsDKeyEvent(e: KeyboardEvent): boolean {
  if (e.code === "KeyD") {
    return true;
  }
  const k = e.key;
  return k === "d" || k === "D" || k === "в" || k === "В";
}
