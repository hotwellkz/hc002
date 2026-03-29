import { useMemo } from "react";
import { DoubleSide } from "three";

import type { Project } from "@/core/domain/project";

import { meshStandardPresetForLayerOrDefault } from "./materials3d";
import { selectWallsForScene3d } from "./selectors/walls3d";
import { wallsToMeshSpecs } from "./wallMeshSpec";

interface ProjectWallsProps {
  readonly project: Project;
}

/**
 * Меши стен из domain model; обновляется при любом изменении project.
 */
export function ProjectWalls({ project }: ProjectWallsProps) {
  const specs = useMemo(() => {
    const walls = selectWallsForScene3d(project);
    return wallsToMeshSpecs(project, walls);
  }, [project]);

  return (
    <group name="project-walls">
      {specs.map((s) => {
        const preset = meshStandardPresetForLayerOrDefault(s.materialType);
        return (
          <mesh
            key={s.reactKey}
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
          </mesh>
        );
      })}
    </group>
  );
}
