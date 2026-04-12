import type { ComponentType } from "react";

import type { Editor2dPlanScope } from "@/core/domain/viewState";
import { useAppStore } from "@/store/useAppStore";

import { Editor2DFloorStructureToolbar } from "./Editor2DFloorStructureToolbar";
import { Editor2DFoundationToolbar } from "./Editor2DFoundationToolbar";
import { Editor2DPlanToolbar } from "./Editor2DPlanToolbar";

/** Верхняя панель контекстных инструментов 2D по подрежиму плана (без дублирования JSX-ветвлений). */
export const EDITOR_2D_PLAN_TOOLBAR_BY_SCOPE: Readonly<Record<Editor2dPlanScope, ComponentType>> = {
  main: Editor2DPlanToolbar,
  floorStructure: Editor2DFloorStructureToolbar,
  foundation: Editor2DFoundationToolbar,
};

export function Editor2DScopeToolbar() {
  const scope = useAppStore((s) => s.currentProject.viewState.editor2dPlanScope);
  const Comp = EDITOR_2D_PLAN_TOOLBAR_BY_SCOPE[scope];
  return <Comp />;
}
