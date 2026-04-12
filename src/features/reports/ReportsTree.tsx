import { useMemo } from "react";

import { REPORT_DEFINITIONS } from "@/core/reports/registry";
import { evaluateReportReadiness } from "@/core/reports/readiness";
import type { ReportDefinition, ReportStatus } from "@/core/reports/types";
import type { Project } from "@/core/domain/project";

import "./reports-workspace.css";

function statusDotClass(s: ReportStatus): string {
  switch (s) {
    case "ready":
      return "reports-tree__dot--ready";
    case "warning":
      return "reports-tree__dot--warn";
    case "blocked":
      return "reports-tree__dot--blocked";
    case "soon":
      return "reports-tree__dot--soon";
    default: {
      const _e: never = s;
      return _e;
    }
  }
}

function statusLabel(s: ReportStatus): string {
  switch (s) {
    case "ready":
      return "Готов";
    case "warning":
      return "Есть замечания";
    case "blocked":
      return "Нет данных";
    case "soon":
      return "Скоро";
    default: {
      const _e: never = s;
      return _e;
    }
  }
}

export interface ReportsTreeProps {
  readonly project: Project;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}

export function ReportsTree({ project, selectedId, onSelect }: ReportsTreeProps) {
  const groups = useMemo(() => {
    const m = new Map<string, ReportDefinition[]>();
    for (const d of REPORT_DEFINITIONS) {
      const arr = m.get(d.groupId) ?? [];
      arr.push(d);
      m.set(d.groupId, arr);
    }
    return m;
  }, []);

  const groupTitle: Record<string, string> = {
    cover: "ОБЛОЖКА",
    foundation: "Фундамент",
    walls: "Стены",
  };

  return (
    <div className="reports-tree" role="tree">
      {[...groups.entries()].map(([gid, defs]) => (
        <div key={gid} className="reports-tree__group" role="group">
          <div className="reports-tree__group-title">{groupTitle[gid] ?? gid}</div>
          <ul className="reports-tree__list">
            {defs.map((d) => {
              const r = evaluateReportReadiness(project, d);
              const active = selectedId === d.id;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    role="treeitem"
                    className={["reports-tree__item", active ? "reports-tree__item--active" : ""].filter(Boolean).join(" ")}
                    data-status={r.status}
                    onClick={() => onSelect(d.id)}
                  >
                    <span className={["reports-tree__dot", statusDotClass(r.status)].join(" ")} title={statusLabel(r.status)} />
                    <span className="reports-tree__label">{d.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
