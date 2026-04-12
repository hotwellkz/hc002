import { useEffect, useMemo } from "react";
import { DoubleSide } from "three";

import type { Editor3dPickPayload } from "@/core/domain/editor3dPickPayload";
import type { FoundationStripEntity } from "@/core/domain/foundationStrip";
import type { Project } from "@/core/domain/project";
import { resolveSurfaceTextureBinding } from "@/core/domain/surfaceTextureResolve";
import { surfaceTextureMeshKey } from "@/core/domain/surfaceTextureState";
import { getCatalogDiffuseTexture } from "@/core/textures/proceduralDiffuseTextures";
import { getTextureCatalogEntry } from "@/core/textures/textureCatalog";

import {
  buildFoundationStripExtrudeGeometry,
  foundationStripFootprintMaxSpanMm,
  selectFoundationStripsForScene3d,
} from "./foundationStripMesh3d";
import { editor3dPickUserData } from "./editor3dPick";
import { meshStandardPresetForMaterialType } from "./materials3d";
import { buildSingleTileMaterial, disposeOwnedMaterials } from "./surfaceTextureMaterial3d";

const concrete = meshStandardPresetForMaterialType("concrete");

interface ProjectFoundationStripsProps {
  readonly project: Project;
  readonly selectedStripEntityId: string | null;
  readonly hoverStripEntityId: string | null;
  readonly texturePickHover: Editor3dPickPayload | null;
  readonly texturePickLocked: Editor3dPickPayload | null;
}

function FoundationStripMesh3d({
  entity,
  project,
  selected,
  hover,
}: {
  readonly entity: FoundationStripEntity;
  readonly project: Project;
  readonly selected: boolean;
  readonly hover: boolean;
}) {
  const built = useMemo(() => buildFoundationStripExtrudeGeometry(entity, project), [entity, project]);

  useEffect(() => {
    return () => {
      built?.geometry.dispose();
    };
  }, [built]);

  const texturedMat = useMemo(() => {
    if (!built) {
      return null;
    }
    const binding = resolveSurfaceTextureBinding(
      project.surfaceTextureState,
      surfaceTextureMeshKey("foundationStrip", entity.id),
      entity.layerId,
    );
    if (!binding) {
      return null;
    }
    const entry = getTextureCatalogEntry(binding.textureId);
    if (!entry) {
      return null;
    }
    const tileM = entry.defaultScaleM * (binding.scalePercent / 100);
    const spanM = foundationStripFootprintMaxSpanMm(entity) * 0.001;
    const repeat = Math.max(0.02, spanM / tileM);
    const baseMap = getCatalogDiffuseTexture(entry.id, entry.procedural.kind, entry.procedural.seed);
    return buildSingleTileMaterial({
      preset: concrete,
      baseMap,
      repeatU: repeat,
      repeatV: repeat,
      doubleSided: true,
    });
  }, [built, entity, project.surfaceTextureState]);

  useEffect(() => {
    return () => {
      if (texturedMat) {
        disposeOwnedMaterials(texturedMat);
      }
    };
  }, [texturedMat]);

  if (!built) {
    return null;
  }

  const pick = editor3dPickUserData({
    kind: "foundationStrip",
    entityId: entity.id,
    reactKey: entity.id,
  });

  const tint = selected ? 1.08 : hover ? 1.04 : 1;
  const color = concrete.color;
  const r = Math.min(255, ((color >> 16) & 0xff) * tint);
  const g = Math.min(255, ((color >> 8) & 0xff) * tint);
  const b = Math.min(255, (color & 0xff) * tint);
  const tinted = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);

  if (texturedMat) {
    return (
      <mesh
        userData={pick}
        geometry={built.geometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, built.bottomM, 0]}
        castShadow
        receiveShadow
        material={texturedMat}
      />
    );
  }

  return (
    <mesh
      userData={pick}
      geometry={built.geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, built.bottomM, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={tinted}
        roughness={concrete.roughness}
        metalness={concrete.metalness}
        side={DoubleSide}
      />
    </mesh>
  );
}

export function ProjectFoundationStrips({
  project,
  selectedStripEntityId,
  hoverStripEntityId,
  texturePickHover: _h,
  texturePickLocked: _l,
}: ProjectFoundationStripsProps) {
  void _h;
  void _l;
  const strips = useMemo(() => selectFoundationStripsForScene3d(project), [project]);
  const visible = project.viewState.show3dFoundation !== false;
  return (
    <group name="project-foundation-strips" visible={visible}>
      {strips.map((fs) => (
        <FoundationStripMesh3d
          key={fs.id}
          entity={fs}
          project={project}
          selected={selectedStripEntityId === fs.id}
          hover={hoverStripEntityId === fs.id && selectedStripEntityId !== fs.id}
        />
      ))}
    </group>
  );
}
