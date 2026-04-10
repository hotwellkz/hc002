import { Line } from "@react-three/drei";
import { useMemo } from "react";

import { buildSipSeamVerticalLineSegmentsForProject } from "@/core/domain/sipSeamLines3d";
import type { Project } from "@/core/domain/project";

import { CALC_SEAM_VISUAL } from "./calculationSeamVisual3d";

interface ProjectSipSeamLinesProps {
  readonly project: Project;
  readonly visible: boolean;
}

/**
 * Отдельный слой вертикальных стыков SIP/OSB: пунктир на обеих наружных гранях, с offset от оболочки
 * (см. `SIP_SEAM_LINE_FACE_OFFSET_MM`), без z-fighting с объёмом EPS расчёта.
 */
export function ProjectSipSeamLines({ project, visible }: ProjectSipSeamLinesProps) {
  const segments = useMemo(() => buildSipSeamVerticalLineSegmentsForProject(project), [project]);
  const v = CALC_SEAM_VISUAL.sipLine;

  if (!visible || segments.length === 0) {
    return null;
  }

  return (
    <group name="project-sip-seam-lines" renderOrder={24}>
      {segments.map((s) => (
        <Line
          key={s.key}
          points={[s.a, s.b]}
          color={v.color}
          lineWidth={v.lineWidthPx}
          dashed
          dashSize={v.dashSizeM}
          gapSize={v.gapSizeM}
          transparent
          opacity={v.opacity}
          depthTest
          depthWrite={false}
          renderOrder={24}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
