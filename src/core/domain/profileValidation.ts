import type { Profile } from "./profile";
import { resolveRoofProfileAssembly, validateRoofProfileAssemblyForCalculation } from "./roofProfileAssembly";

/** Сообщения об ошибках для UI (без alert). */
export function validateProfile(p: Profile): string[] {
  const errors: string[] = [];
  if (!p.name.trim()) {
    errors.push("Укажите название профиля.");
  }

  const num = (v: number | undefined) => v != null && Number.isFinite(v);

  if (p.category === "roof") {
    errors.push(...validateRoofProfileAssemblyForCalculation(resolveRoofProfileAssembly(p)));
    return errors;
  }

  if (p.compositionMode === "layered") {
    if (p.layers.length < 1) {
      errors.push("Для составного профиля нужен хотя бы один слой.");
    }
    p.layers.forEach((l, i) => {
      if (!(l.thicknessMm > 0)) {
        errors.push(`Слой ${i + 1}: толщина должна быть больше 0.`);
      }
      if (!String(l.materialName).trim()) {
        errors.push(`Слой ${i + 1}: укажите название материала.`);
      }
    });
  } else {
    if (p.layers.length > 1) {
      errors.push("Для цельного профиля допустим не более одного слоя.");
    }
    if (p.layers.length === 1) {
      const l = p.layers[0]!;
      if (!(l.thicknessMm > 0)) {
        errors.push("Толщина сечения должна быть больше 0.");
      }
      if (!String(l.materialName).trim()) {
        errors.push("Укажите материал.");
      }
    } else {
      if (!num(p.defaultThicknessMm) || !(p.defaultThicknessMm! > 0)) {
        errors.push("Укажите толщину сечения (мм) или один слой с толщиной.");
      }
    }
  }

  if (p.defaultHeightMm != null && !Number.isFinite(p.defaultHeightMm)) {
    errors.push("Некорректная высота по умолчанию.");
  }
  if (p.defaultWidthMm != null && !Number.isFinite(p.defaultWidthMm)) {
    errors.push("Некорректная ширина по умолчанию.");
  }
  if (p.defaultThicknessMm != null && !Number.isFinite(p.defaultThicknessMm)) {
    errors.push("Некорректная толщина по умолчанию.");
  }
  if (p.linearStockMaxLengthMm != null) {
    if (!Number.isFinite(p.linearStockMaxLengthMm) || !(p.linearStockMaxLengthMm > 0)) {
      errors.push("Максимальная длина сегмента (мм) должна быть числом больше 0.");
    }
  }

  if (p.category === "wall") {
    const mp = String(p.markPrefix ?? "").trim();
    if (!mp) {
      errors.push("Укажите префикс маркировки стены (например 1S).");
    } else if (!/^[\p{L}\p{N}_-]+$/u.test(mp)) {
      errors.push("Префикс марки: только буквы, цифры, «_» и «-» (без пробелов).");
    }
    const wm = p.wallManufacturing;
    if (wm?.studSpacingMm != null && !(wm.studSpacingMm > 0 && Number.isFinite(wm.studSpacingMm))) {
      errors.push("Шаг каркаса должен быть числом больше 0.");
    }
    if (wm?.frameMemberWidthMm != null && !(wm.frameMemberWidthMm > 0 && Number.isFinite(wm.frameMemberWidthMm))) {
      errors.push("Ширина профиля каркаса должна быть числом больше 0.");
    }
  }

  return errors;
}
