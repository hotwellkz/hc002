import { useEffect, useMemo } from "react";
import { DoubleSide } from "three";

import type { Editor3dPickPayload } from "@/core/domain/editor3dPickPayload";
import { computeLayerVerticalStack } from "@/core/domain/layerVerticalStack";
import type { FoundationPileEntity } from "@/core/domain/foundationPile";
import type { Project } from "@/core/domain/project";
import { resolveSurfaceTextureBinding } from "@/core/domain/surfaceTextureResolve";
import { surfaceTextureMeshKey } from "@/core/domain/surfaceTextureState";
import { getCatalogDiffuseTexture } from "@/core/textures/proceduralDiffuseTextures";
import { getTextureCatalogEntry } from "@/core/textures/textureCatalog";

import { editor3dPickUserData } from "./editor3dPick";
import { ExactBoxSelectionOutline } from "./ExactBoxSelectionOutline";
import {
  HOVER_BOX_OUTLINE_3D,
  SELECTION_BOX_OUTLINE_3D,
  TEXTURE_TOOL_HOVER_OUTLINE_3D,
  TEXTURE_TOOL_LOCKED_OUTLINE_3D,
} from "./calculationSeamVisual3d";
import { editor3dTextureHighlightMatches } from "./editor3dTextureHighlight";
import { meshStandardPresetForMaterialType } from "./materials3d";
import { buildTexturedBoxMaterials, disposeOwnedMaterials } from "./surfaceTextureMaterial3d";

const MM_TO_M = 0.001;

function pileMeshesForEntity(
  _project: Project,
  pile: FoundationPileEntity,
  layerBaseById: ReadonlyMap<string, { readonly computedBaseMm: number }>,
) {
  const concrete = meshStandardPresetForMaterialType("concrete");
  if (pile.pileKind === "screw") {
    return { parts: [] as { key: string; position: readonly [number, number, number]; width: number; height: number; depth: number }[], concrete };
  }
  const elevMm = layerBaseById.get(pile.layerId)?.computedBaseMm ?? 0;
  const topM = (elevMm + pile.levelMm) * MM_TO_M;
  const bottomM = topM - pile.heightMm * MM_TO_M;
  const capThkMm =
    pile.capSizeMm > pile.sizeMm + 0.5
      ? Math.min(80, Math.max(40, Math.min(pile.heightMm * 0.08, 80)))
      : 0;
  const bodyTopM = topM - capThkMm * MM_TO_M;
  const sizeM = pile.sizeMm * MM_TO_M;
  const capM = pile.capSizeMm * MM_TO_M;
  const cx = pile.centerX * MM_TO_M;
  const cz = -pile.centerY * MM_TO_M;
  type Part = {
    readonly key: string;
    readonly position: readonly [number, number, number];
    readonly width: number;
    readonly height: number;
    readonly depth: number;
  };

  const parts: Part[] = [];
  if (capThkMm > 0 && bodyTopM > bottomM + 1e-6) {
    const shaftH = bodyTopM - bottomM;
    const shaftCy = bottomM + shaftH / 2;
    parts.push({
      key: `${pile.id}-shaft`,
      position: [cx, shaftCy, cz],
      width: sizeM,
      height: shaftH,
      depth: sizeM,
    });
    const capH = capThkMm * MM_TO_M;
    const capCy = bodyTopM + capH / 2;
    parts.push({
      key: `${pile.id}-cap`,
      position: [cx, capCy, cz],
      width: capM,
      height: capH,
      depth: capM,
    });
  } else {
    const h = topM - bottomM;
    const cy = bottomM + h / 2;
    parts.push({
      key: pile.id,
      position: [cx, cy, cz],
      width: sizeM,
      height: h,
      depth: sizeM,
    });
  }

  return { parts, concrete };
}

function PilePartMesh({
  pile,
  pt,
  project,
  concrete,
  texturePickHover,
  texturePickLocked,
}: {
  readonly pile: FoundationPileEntity;
  readonly pt: {
    readonly key: string;
    readonly position: readonly [number, number, number];
    readonly width: number;
    readonly height: number;
    readonly depth: number;
  };
  readonly project: Project;
  readonly concrete: ReturnType<typeof meshStandardPresetForMaterialType>;
  readonly texturePickHover: Editor3dPickPayload | null;
  readonly texturePickLocked: Editor3dPickPayload | null;
}) {
  const texturedMaterials = useMemo(() => {
    const binding = resolveSurfaceTextureBinding(
      project.surfaceTextureState,
      surfaceTextureMeshKey("foundationPile", pt.key),
      pile.layerId,
    );
    if (!binding) {
      return null;
    }
    const entry = getTextureCatalogEntry(binding.textureId);
    if (!entry) {
      return null;
    }
    const tileM = entry.defaultScaleM * (binding.scalePercent / 100);
    const baseMap = getCatalogDiffuseTexture(entry.id, entry.procedural.kind, entry.procedural.seed);
    return buildTexturedBoxMaterials({
      preset: concrete,
      baseMap,
      widthM: pt.width,
      heightM: pt.height,
      depthM: pt.depth,
      tileWorldSizeM: tileM,
      doubleSided: true,
    });
  }, [concrete, pile.layerId, project.surfaceTextureState, pt.depth, pt.height, pt.key, pt.width]);

  useEffect(() => {
    return () => {
      if (texturedMaterials) {
        disposeOwnedMaterials(texturedMaterials);
      }
    };
  }, [texturedMaterials]);

  const pick = editor3dPickUserData({
    kind: "foundationPile",
    entityId: pile.id,
    reactKey: pt.key,
  });

  const texLocked = editor3dTextureHighlightMatches("foundationPile", pile.id, pt.key, texturePickLocked);
  const texHover =
    !texLocked && editor3dTextureHighlightMatches("foundationPile", pile.id, pt.key, texturePickHover);

  const meshEl = texturedMaterials ? (
    <mesh userData={pick} position={pt.position} castShadow receiveShadow material={texturedMaterials}>
      <boxGeometry args={[pt.width, pt.height, pt.depth]} />
    </mesh>
  ) : (
    <mesh userData={pick} position={pt.position} castShadow receiveShadow>
      <boxGeometry args={[pt.width, pt.height, pt.depth]} />
      <meshStandardMaterial
        color={concrete.color}
        roughness={concrete.roughness}
        metalness={concrete.metalness}
        side={DoubleSide}
      />
    </mesh>
  );

  return (
    <group>
      {meshEl}
      {texLocked ? (
        <ExactBoxSelectionOutline
          width={pt.width}
          height={pt.height}
          depth={pt.depth}
          position={pt.position}
          rotationY={0}
          color={TEXTURE_TOOL_LOCKED_OUTLINE_3D.color}
          opacity={TEXTURE_TOOL_LOCKED_OUTLINE_3D.opacity}
        />
      ) : null}
      {texHover ? (
        <ExactBoxSelectionOutline
          width={pt.width}
          height={pt.height}
          depth={pt.depth}
          position={pt.position}
          rotationY={0}
          color={TEXTURE_TOOL_HOVER_OUTLINE_3D.color}
          opacity={TEXTURE_TOOL_HOVER_OUTLINE_3D.opacity}
        />
      ) : null}
    </group>
  );
}

interface ProjectFoundationPilesProps {
  readonly project: Project;
  readonly selectedPileEntityId: string | null;
  readonly hoverPileEntityId: string | null;
  readonly texturePickHover: Editor3dPickPayload | null;
  readonly texturePickLocked: Editor3dPickPayload | null;
}

export function ProjectFoundationPiles({
  project,
  selectedPileEntityId,
  hoverPileEntityId,
  texturePickHover,
  texturePickLocked,
}: ProjectFoundationPilesProps) {
  const items = useMemo(() => {
    const layerBaseById = computeLayerVerticalStack(project);
    const out: {
      readonly pile: FoundationPileEntity;
      readonly parts: ReturnType<typeof pileMeshesForEntity>["parts"];
      readonly concrete: ReturnType<typeof pileMeshesForEntity>["concrete"];
    }[] = [];
    for (const pile of project.foundationPiles) {
      const r = pileMeshesForEntity(project, pile, layerBaseById);
      if (r.parts.length === 0) {
        continue;
      }
      out.push({ pile, parts: r.parts, concrete: r.concrete });
    }
    return out;
  }, [project]);

  const visible = project.viewState.show3dPiles !== false;

  return (
    <group name="project-foundation-piles" visible={visible}>
      {items.map(({ pile, parts, concrete }) => {
        const shellSelected = selectedPileEntityId === pile.id;
        const hoverThis = hoverPileEntityId === pile.id && !shellSelected;
        return (
          <group key={pile.id}>
            {parts.map((pt) => (
              <PilePartMesh
                key={pt.key}
                pile={pile}
                pt={pt}
                project={project}
                concrete={concrete}
                texturePickHover={texturePickHover}
                texturePickLocked={texturePickLocked}
              />
            ))}
            {shellSelected
              ? parts.map((pt) => (
                  <ExactBoxSelectionOutline
                    key={`${pt.key}-sel`}
                    width={pt.width}
                    height={pt.height}
                    depth={pt.depth}
                    position={pt.position}
                    rotationY={0}
                    color={SELECTION_BOX_OUTLINE_3D.color}
                    opacity={SELECTION_BOX_OUTLINE_3D.opacity}
                  />
                ))
              : null}
            {hoverThis
              ? parts.map((pt) => (
                  <ExactBoxSelectionOutline
                    key={`${pt.key}-hov`}
                    width={pt.width}
                    height={pt.height}
                    depth={pt.depth}
                    position={pt.position}
                    rotationY={0}
                    color={HOVER_BOX_OUTLINE_3D.color}
                    opacity={HOVER_BOX_OUTLINE_3D.opacity}
                  />
                ))
              : null}
          </group>
        );
      })}
    </group>
  );
}
