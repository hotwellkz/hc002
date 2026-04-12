import { Edges } from "@react-three/drei";
import { useMemo } from "react";
import { DoubleSide } from "three";

import type { Project } from "@/core/domain/project";

import {
  FLOOR_BEAM_PROFILE_EDGES_3D,
  HOVER_BOX_OUTLINE_3D,
  SELECTION_BOX_OUTLINE_3D,
} from "./calculationSeamVisual3d";
import { editor3dPickUserData } from "./editor3dPick";
import { ExactBoxSelectionOutline } from "./ExactBoxSelectionOutline";
import { meshStandardPresetForLayerOrDefault } from "./materials3d";
import { floorBeamsForScene3d, floorBeamsToMeshSpecs, type FloorBeamRenderMeshSpec } from "./floorBeamMeshSpec";

interface ProjectFloorBeamsProps {
  readonly project: Project;
  readonly selectedBeamEntityId: string | null;
  readonly hoverBeamEntityId: string | null;
}

function FloorBeamMesh3d({
  s,
  selected,
  hoverThis,
}: {
  readonly s: FloorBeamRenderMeshSpec;
  readonly selected: boolean;
  readonly hoverThis: boolean;
}) {
  const preset = meshStandardPresetForLayerOrDefault(s.materialType);
  const pick = editor3dPickUserData({ kind: "floorBeam", entityId: s.beamId, reactKey: s.reactKey });
  const edgeV = FLOOR_BEAM_PROFILE_EDGES_3D.edges;

  return (
    <group>
      <mesh
        userData={pick}
        position={s.position}
        rotation={[0, s.rotationY, 0]}
        castShadow
        receiveShadow
      >
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
          position={s.position}
          rotationY={s.rotationY}
          color={SELECTION_BOX_OUTLINE_3D.color}
          opacity={SELECTION_BOX_OUTLINE_3D.opacity}
        />
      ) : null}
      {hoverThis ? (
        <ExactBoxSelectionOutline
          width={s.width}
          height={s.height}
          depth={s.depth}
          position={s.position}
          rotationY={s.rotationY}
          color={HOVER_BOX_OUTLINE_3D.color}
          opacity={HOVER_BOX_OUTLINE_3D.opacity}
        />
      ) : null}
    </group>
  );
}

export function ProjectFloorBeams({
  project,
  selectedBeamEntityId,
  hoverBeamEntityId,
}: ProjectFloorBeamsProps) {
  const specs = useMemo(() => {
    const beams = floorBeamsForScene3d(project);
    return floorBeamsToMeshSpecs(project, beams);
  }, [project]);

  return (
    <group name="project-floor-beams">
      {specs.map((s) => (
        <FloorBeamMesh3d
          key={s.reactKey}
          s={s}
          selected={selectedBeamEntityId === s.beamId}
          hoverThis={hoverBeamEntityId === s.beamId}
        />
      ))}
    </group>
  );
}
