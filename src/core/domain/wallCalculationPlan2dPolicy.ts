import type { LumberRole } from "./wallCalculation";
import { normalizeLumberRole } from "./wallCalculation";

const DRAWN_ROLES = new Set<LumberRole>([
  "upper_plate",
  "lower_plate",
  "joint_board",
  "edge_board",
  "opening_left_stud",
  "opening_right_stud",
  "opening_header",
  "opening_cripple",
  "opening_sill",
  "tee_joint_board",
  "corner_joint_board",
  "framing_member_generic",
]);

/**
 * Политика отображения расчётных досок на 2D-плане (только визуализация).
 * Модель расчёта, Firebase и спецификация не меняются — фильтр применяется только в рендере.
 *
 * Заливка: обвязка, торцы, стыки, проёмы, узлы — в пределах owner wall и полосы core (см. wallCalculation2dPixi).
 * Подписи: по умолчанию только стыки (меньше шума); см. isLumberRoleLabeledInPlan2d.
 */
export function isLumberRoleDrawnInPlan2d(role: LumberRole | string): boolean {
  const r = normalizeLumberRole(role);
  return DRAWN_ROLES.has(r);
}

/** Какие детали могут получить подпись при hover / сильном zoom (тот же набор, что и заливка). */
export function isLumberRoleLabeledInPlan2d(role: LumberRole | string): boolean {
  return isLumberRoleDrawnInPlan2d(role);
}

/** @deprecated Используйте isLumberRoleDrawnInPlan2d / isLumberRoleLabeledInPlan2d */
export function isLumberRoleVisibleInPlan2d(role: LumberRole | string): boolean {
  return isLumberRoleLabeledInPlan2d(role);
}
