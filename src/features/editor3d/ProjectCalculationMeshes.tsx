import { useMemo } from "react";

import type { Project } from "@/core/domain/project";
import { buildCalculationSolidSpecsForProject } from "@/core/domain/wallCalculation3dSpecs";

import { useSharedCalculationMeshMaterials } from "./calculationMeshMaterials3d";
import { isCalculationSolidVisible } from "./view3dVisibility";

interface ProjectCalculationMeshesProps {
  readonly project: Project;
  readonly visible: boolean;
  readonly selectedReactKey: string | null;
  readonly onSelect: (spec: (ReturnType<typeof buildCalculationSolidSpecsForProject>)[number]) => void;
}

/**
 * Объёмы из wallCalculations (SIP-панели + пиломатериалы); пересобирается при изменении project.
 * Тонкие швы — общие материалы (wood/eps/seam), без дублирования preset на каждый mesh.
 */
export function ProjectCalculationMeshes({ project, visible, selectedReactKey, onSelect }: ProjectCalculationMeshesProps) {
  const materials = useSharedCalculationMeshMaterials();
  const specs = useMemo(() => {
    const all = buildCalculationSolidSpecsForProject(project);
    return all.filter((s) => isCalculationSolidVisible(s, project));
  }, [project]);

  if (!visible || specs.length === 0) {
    return null;
  }

  return (
    <group name="project-calculation-derived">
      {specs.map((s) => {
        const mat = s.source === "lumber" ? materials.lumber : materials.eps;
        return (
          <group key={s.reactKey}>
            <mesh
              material={mat}
              position={s.position}
              rotation={[0, s.rotationY, 0]}
              castShadow
              receiveShadow
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(s);
              }}
            >
              <boxGeometry args={[s.width, s.height, s.depth]} />
            </mesh>
            {selectedReactKey === s.reactKey ? (
              <mesh position={s.position} rotation={[0, s.rotationY, 0]}>
                <boxGeometry args={[s.width * 1.015, s.height * 1.015, s.depth * 1.015]} />
                <meshBasicMaterial color={0xf2c94c} wireframe transparent opacity={0.95} depthTest={false} />
              </mesh>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}
