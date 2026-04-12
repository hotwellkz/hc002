import { Edges } from "@react-three/drei";
import { useMemo } from "react";
import { DoubleSide, Quaternion } from "three";

import type { Project } from "@/core/domain/project";

import {
  FLOOR_BEAM_PROFILE_EDGES_3D,
  HOVER_BOX_OUTLINE_3D,
  SELECTION_BOX_OUTLINE_3D,
} from "./calculationSeamVisual3d";
import { editor3dPickUserData } from "./editor3dPick";
import { ExactBoxSelectionOutline } from "./ExactBoxSelectionOutline";
import { meshStandardPresetForLayerOrDefault } from "./materials3d";
import { roofRaftersForScene3d, roofRaftersToMeshSpecs, type RoofRafterRenderMeshSpec } from "./roofRafterMeshSpec";

interface ProjectRoofRaftersProps {
  readonly project: Project;
  readonly selectedRafterEntityId: string | null;
  readonly hoverRafterEntityId: string | null;
}

function RoofRafterMesh3d({
  s,
  selected,
  hoverThis,
}: {
  readonly s: RoofRafterRenderMeshSpec;
  readonly selected: boolean;
  readonly hoverThis: boolean;
}) {
  const preset = meshStandardPresetForLayerOrDefault(s.materialType);
  const pick = editor3dPickUserData({ kind: "roofRafter", entityId: s.rafterId, reactKey: s.reactKey });
  const edgeV = FLOOR_BEAM_PROFILE_EDGES_3D.edges;
  const q = useMemo(() => new Quaternion(s.quaternion[0], s.quaternion[1], s.quaternion[2], s.quaternion[3]), [s.quaternion]);

  return (
    <group position={s.position} quaternion={q}>
      <mesh userData={pick} castShadow receiveShadow>
        <boxGeometry args={[s.width, s.height, s.depth]} />
        <meshStandardMaterial
          color={preset.color}
          roughness={preset.roughness}
          metalness={preset.metalness}
          side={DoubleSide}
        />
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
      </mesh>
      {selected ? (
        <ExactBoxSelectionOutline
          width={s.width}
          height={s.height}
          depth={s.depth}
          position={[0, 0, 0]}
          quaternion={[q.x, q.y, q.z, q.w]}
          color={SELECTION_BOX_OUTLINE_3D.color}
          opacity={SELECTION_BOX_OUTLINE_3D.opacity}
        />
      ) : null}
      {hoverThis ? (
        <ExactBoxSelectionOutline
          width={s.width}
          height={s.height}
          depth={s.depth}
          position={[0, 0, 0]}
          quaternion={[q.x, q.y, q.z, q.w]}
          color={HOVER_BOX_OUTLINE_3D.color}
          opacity={HOVER_BOX_OUTLINE_3D.opacity}
        />
      ) : null}
    </group>
  );
}

export function ProjectRoofRafters({
  project,
  selectedRafterEntityId,
  hoverRafterEntityId,
}: ProjectRoofRaftersProps) {
  const specs = useMemo(() => {
    const list = roofRaftersForScene3d(project);
    return roofRaftersToMeshSpecs(project, list);
  }, [project]);

  const vs = project.viewState;
  const roofOn = vs.show3dRoof !== false;
  const showRafters = roofOn && vs.show3dRoofRafters !== false;

  return (
    <group name="project-roof-rafters" visible={showRafters}>
      {specs.map((s) => (
        <RoofRafterMesh3d
          key={s.reactKey}
          s={s}
          selected={selectedRafterEntityId === s.rafterId}
          hoverThis={hoverRafterEntityId === s.rafterId}
        />
      ))}
    </group>
  );
}
