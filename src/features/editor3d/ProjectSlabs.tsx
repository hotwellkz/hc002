import { useEffect, useMemo } from "react";
import { DoubleSide } from "three";

import type { Editor3dPickPayload } from "@/core/domain/editor3dPickPayload";
import { slabStructuralCategoryFor3d, type SlabEntity } from "@/core/domain/slab";
import type { Project } from "@/core/domain/project";
import { resolveSurfaceTextureBinding } from "@/core/domain/surfaceTextureResolve";
import { surfaceTextureMeshKey } from "@/core/domain/surfaceTextureState";
import { getCatalogDiffuseTexture } from "@/core/textures/proceduralDiffuseTextures";
import { getTextureCatalogEntry } from "@/core/textures/textureCatalog";

import { buildSlabExtrudeGeometry, selectSlabsForScene3d, slabFootprintMaxSpanMm } from "./slabMesh3d";
import { editor3dPickUserData } from "./editor3dPick";
import { meshStandardPresetForMaterialType } from "./materials3d";
import { buildSingleTileMaterial, disposeOwnedMaterials } from "./surfaceTextureMaterial3d";

const slabPreset = meshStandardPresetForMaterialType("concrete");

interface ProjectSlabsProps {
  readonly project: Project;
  readonly selectedSlabEntityId: string | null;
  readonly hoverSlabEntityId: string | null;
  /** Зарезервировано для единого API сцены (контур плиты — экструзия, без отдельного outline). */
  readonly texturePickHover: Editor3dPickPayload | null;
  readonly texturePickLocked: Editor3dPickPayload | null;
}

function SlabMesh3d({
  entity,
  project,
  selected,
  hover,
}: {
  readonly entity: SlabEntity;
  readonly project: Project;
  readonly selected: boolean;
  readonly hover: boolean;
}) {
  const built = useMemo(() => buildSlabExtrudeGeometry(entity, project), [entity, project]);

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
      surfaceTextureMeshKey("slab", entity.id),
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
    const spanM = slabFootprintMaxSpanMm(entity.pointsMm) * 0.001;
    const repeat = Math.max(0.02, spanM / tileM);
    const baseMap = getCatalogDiffuseTexture(entry.id, entry.procedural.kind, entry.procedural.seed);
    return buildSingleTileMaterial({
      preset: slabPreset,
      baseMap,
      repeatU: repeat,
      repeatV: repeat,
      doubleSided: true,
    });
  }, [built, entity.id, entity.layerId, entity.pointsMm, project.surfaceTextureState]);

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
    kind: "slab",
    entityId: entity.id,
    reactKey: entity.id,
  });

  const tint = selected ? 1.08 : hover ? 1.04 : 1;
  const color = slabPreset.color;
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
        roughness={slabPreset.roughness}
        metalness={slabPreset.metalness}
        side={DoubleSide}
      />
    </mesh>
  );
}

export function ProjectSlabs({
  project,
  selectedSlabEntityId,
  hoverSlabEntityId,
  texturePickHover: _h,
  texturePickLocked: _l,
}: ProjectSlabsProps) {
  void _h;
  void _l;
  const { foundationSlabs, overlapSlabs } = useMemo(() => {
    const all = selectSlabsForScene3d(project);
    const foundationSlabs: SlabEntity[] = [];
    const overlapSlabs: SlabEntity[] = [];
    for (const s of all) {
      (slabStructuralCategoryFor3d(s) === "foundation" ? foundationSlabs : overlapSlabs).push(s);
    }
    return { foundationSlabs, overlapSlabs };
  }, [project]);
  const vs = project.viewState;
  const foundationOn = vs.show3dFoundation !== false;
  const overlapOn = vs.show3dOverlap !== false;
  return (
    <>
      <group name="project-slabs-foundation" visible={foundationOn}>
        {foundationSlabs.map((s) => (
          <SlabMesh3d
            key={s.id}
            entity={s}
            project={project}
            selected={selectedSlabEntityId === s.id}
            hover={hoverSlabEntityId === s.id && selectedSlabEntityId !== s.id}
          />
        ))}
      </group>
      <group name="project-slabs-overlap" visible={overlapOn}>
        {overlapSlabs.map((s) => (
          <SlabMesh3d
            key={s.id}
            entity={s}
            project={project}
            selected={selectedSlabEntityId === s.id}
            hover={hoverSlabEntityId === s.id && selectedSlabEntityId !== s.id}
          />
        ))}
      </group>
    </>
  );
}
