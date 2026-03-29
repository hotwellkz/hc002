/** Режим формы построения стены (не доменная сущность, настройка редактора). */
export type WallShapeMode = "line" | "rectangle";

export function wallShapeModeLabelRu(mode: WallShapeMode): string {
  switch (mode) {
    case "line":
      return "Форма: линия";
    case "rectangle":
      return "Форма: прямоугольник";
  }
}
