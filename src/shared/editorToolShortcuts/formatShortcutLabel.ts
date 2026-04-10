/** Человекочитаемая подпись для `KeyboardEvent.code` (физическая клавиша, без привязки к раскладке). */
export function formatShortcutCodeLabel(code: string): string {
  if (code === "Escape") {
    return "Esc";
  }
  if (code === "Backspace") {
    return "Backspace";
  }
  if (code === "Delete") {
    return "Del";
  }
  if (code === "Space") {
    return "Space";
  }
  if (code.startsWith("Key") && code.length === 4) {
    return code.slice(3);
  }
  if (code.startsWith("Digit") && code.length === 6) {
    return code.slice(5);
  }
  return code;
}

export function formatShortcutCodesList(codes: readonly string[]): string {
  if (codes.length === 0) {
    return "—";
  }
  return codes.map(formatShortcutCodeLabel).join(" · ");
}
