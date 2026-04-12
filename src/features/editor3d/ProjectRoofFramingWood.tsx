import { Edges } from "@react-three/drei";
import { useMemo } from "react";
import { DoubleSide, Quaternion } from "three";

import type { Project } from "@/core/domain/project";

import { FLOOR_BEAM_PROFILE_EDGES_3D } from "./calculationSeamVisual3d";
import {
  roofPostsForScene3d,
  roofPostsToMeshSpecs,
  roofPurlinsForScene3d,
  roofPurlinsToMeshSpecs,
  roofStrutsForScene3d,
  roofStrutsToMeshSpecs,
  type RoofFramingBoxMeshSpec,
} from "./roofFramingMeshSpec";
import { meshStandardPresetForLayerOrDefault } from "./materials3d";

interface ProjectRoofFramingWoodProps {
  readonly project: Project;
}

function FramingBox3d({ s }: { readonly s: RoofFramingBoxMeshSpec }) {
  const preset = meshStandardPresetForLayerOrDefault(s.materialType);
  const edgeV = FLOOR_BEAM_PROFILE_EDGES_3D.edges;
  const q = useMemo(() => new Quaternion(s.quaternion[0], s.quaternion[1], s.quaternion[2], s.quaternion[3]), [s.quaternion]);

  return (
    <group position={s.position} quaternion={q}>
      <mesh castShadow receiveShadow>
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
    </group>
  );
}

/** Стойки, прогон и подкосы генератора крыши (без отдельного выбора в 3D). */
export function ProjectRoofFramingWood({ project }: ProjectRoofFramingWoodProps) {
  const postSpecs = useMemo(() => {
    const list = roofPostsForScene3d(project);
    return roofPostsToMeshSpecs(project, list);
  }, [project]);
  const purlinSpecs = useMemo(() => {
    const list = roofPurlinsForScene3d(project);
    return roofPurlinsToMeshSpecs(project, list);
  }, [project]);
  const strutSpecs = useMemo(() => {
    const list = roofStrutsForScene3d(project);
    return roofStrutsToMeshSpecs(project, list);
  }, [project]);

  const roofOn = project.viewState.show3dRoof !== false;
  const hasAny = postSpecs.length > 0 || purlinSpecs.length > 0 || strutSpecs.length > 0;

  if (!hasAny) {
    return null;
  }

  return (
    <group name="project-roof-framing-wood" visible={roofOn}>
      {postSpecs.map((s) => (
        <FramingBox3d key={s.reactKey} s={s} />
      ))}
      {purlinSpecs.map((s) => (
        <FramingBox3d key={s.reactKey} s={s} />
      ))}
      {strutSpecs.map((s) => (
        <FramingBox3d key={s.reactKey} s={s} />
      ))}
    </group>
  );
}
