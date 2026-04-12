import type { ExportBundle, ReportDefinition } from "./types";

export const REPORT_DEFINITIONS: readonly ReportDefinition[] = [
  {
    id: "project_cover_3d",
    groupId: "cover",
    title: "3D вид дома",
    implemented: true,
    viewKind: "project_cover_3d",
    sheetTemplateId: "a4_landscape",
  },
  {
    id: "foundation_plan",
    groupId: "foundation",
    title: "План фундамента",
    implemented: true,
    viewKind: "foundation_plan",
    sheetTemplateId: "a4_landscape",
  },
  {
    id: "wall_plan",
    groupId: "walls",
    title: "План стен",
    implemented: false,
    viewKind: "wall_plan",
    sheetTemplateId: "a4_landscape",
  },
];

export const REPORT_DEFINITION_MAP: ReadonlyMap<string, ReportDefinition> = new Map(
  REPORT_DEFINITIONS.map((d) => [d.id, d]),
);

export const DEFAULT_EXPORT_BUNDLE: ExportBundle = {
  id: "mvp_single",
  title: "Текущий отчёт",
  sections: [
    { reportDefinitionId: "project_cover_3d", enabled: true, order: 0 },
    { reportDefinitionId: "foundation_plan", enabled: true, order: 1 },
  ],
};

export function getReportDefinition(id: string): ReportDefinition | undefined {
  return REPORT_DEFINITION_MAP.get(id);
}
