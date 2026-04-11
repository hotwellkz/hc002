export type EditorInstructionLineVariant = "primary" | "secondary" | "muted";

export interface EditorInstructionLine {
  readonly text: string;
  readonly variant: EditorInstructionLineVariant;
}

/**
 * Собирает иерархию строк подсказки: первая — главное действие, далее вторичные и подсказки клавиш.
 */
export function hintLines(
  primary: string,
  rest: ReadonlyArray<{ readonly text: string; readonly variant?: "secondary" | "muted" }> = [],
): readonly EditorInstructionLine[] {
  const out: EditorInstructionLine[] = [{ text: primary, variant: "primary" }];
  for (const r of rest) {
    const t = r.text.trim();
    if (!t) {
      continue;
    }
    out.push({ text: t, variant: r.variant ?? "secondary" });
  }
  return out;
}
