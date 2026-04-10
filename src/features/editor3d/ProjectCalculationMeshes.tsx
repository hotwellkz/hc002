import { Edges } from "@react-three/drei";
import { useMemo } from "react";

import type { Project } from "@/core/domain/project";
import { buildCalculationSolidSpecsForProject } from "@/core/domain/wallCalculation3dSpecs";

import { LUMBER_FRAME_VISUAL_3D, SELECTION_BOX_OUTLINE_3D } from "./calculationSeamVisual3d";
import { useSharedCalculationMeshMaterials } from "./calculationMeshMaterials3d";
import { ExactBoxSelectionOutline } from "./ExactBoxSelectionOutline";
import { isCalculationSolidVisible } from "./view3dVisibility";

interface ProjectCalculationMeshesProps {
  readonly project: Project;
  readonly visible: boolean;
  readonly selectedReactKey: string | null;
  readonly onSelect: (spec: (ReturnType<typeof buildCalculationSolidSpecsForProject>)[number]) => void;
}

/**
 * Объёмы из wallCalculations (SIP-панели + пиломатериалы).
 * Каркас: рёбра бруса через `Edges` на той же boxGeometry, без отдельных seam-mesh.
 */
export function ProjectCalculationMeshes({ project, visible, selectedReactKey, onSelect }: ProjectCalculationMeshesProps) {
  const materials = useSharedCalculationMeshMaterials();
  const edgeV = LUMBER_FRAME_VISUAL_3D.edges;
  const selV = SELECTION_BOX_OUTLINE_3D;

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
        const mat =
          s.source === "lumber"
            ? materials.lumber
            : (materials.byMaterialType.get(s.materialType) ?? materials.eps);
        const isLumber = s.source === "lumber";
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
              {isLumber ? (
                <Edges
                  threshold={edgeV.threshold}
                  color={edgeV.color}
                  lineWidth={edgeV.lineWidthPx}
                  transparent
                  opacity={edgeV.opacity}
                  depthTest
                  depthWrite={false}
                  renderOrder={2}
                  raycast={() => null}
                />
              ) : null}
            </mesh>
            {selectedReactKey === s.reactKey ? (
              <ExactBoxSelectionOutline
                width={s.width}
                height={s.height}
                depth={s.depth}
                position={s.position}
                rotationY={s.rotationY}
                color={selV.color}
                opacity={selV.opacity}
              />
            ) : null}
          </group>
        );
      })}
    </group>
  );
}
