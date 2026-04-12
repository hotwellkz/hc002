import { Edges } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide, Quaternion } from "three";

import { getProfileById } from "@/core/domain/profileOps";
import type { Project } from "@/core/domain/project";
import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import { resolveRoofProfileAssembly } from "@/core/domain/roofProfileAssembly";
import { roofBattenPickEntityId, roofBattenPickReactKey } from "@/core/domain/roofBattenPick3d";
import type { RoofBattenBoxSpecMm } from "@/core/geometry/roofAssemblyGeometry3d";
import {
  buildRoofBattenBoxSpecsMm,
  buildRoofSlopeSurfaceMeshMm,
  offsetRoofMeshMm,
  roofAssemblyZAdjustMmByPlaneIdForProject,
  roofBattenCenterWorldM,
  roofLayerBaseMmForPlane,
  roofMeshToWorldMeters,
} from "@/core/geometry/roofAssemblyGeometry3d";

import {
  FLOOR_BEAM_PROFILE_EDGES_3D,
  HOVER_BOX_OUTLINE_3D,
  SELECTION_BOX_OUTLINE_3D,
} from "./calculationSeamVisual3d";
import { editor3dPickUserData } from "./editor3dPick";
import { ExactBoxSelectionOutline } from "./ExactBoxSelectionOutline";
import { meshStandardPresetForMaterialType } from "./materials3d";

function parseHexColor(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) {
    return 0x888888;
  }
  return parseInt(m[1]!, 16);
}

function RoofBattenBoardMesh3d({
  planeId,
  battenIndex,
  b,
  woodPreset,
  selected,
  hoverThis,
}: {
  readonly planeId: string;
  readonly battenIndex: number;
  readonly b: RoofBattenBoxSpecMm;
  readonly woodPreset: ReturnType<typeof meshStandardPresetForMaterialType>;
  readonly selected: boolean;
  readonly hoverThis: boolean;
}) {
  const c = roofBattenCenterWorldM(b);
  const q = new Quaternion(b.quaternion[0], b.quaternion[1], b.quaternion[2], b.quaternion[3]);
  const qw = b.widthMm * 0.001;
  const qh = b.heightMm * 0.001;
  const qd = b.lengthMm * 0.001;
  const entityId = roofBattenPickEntityId(planeId, battenIndex);
  const reactKey = roofBattenPickReactKey(planeId, battenIndex);
  const pick = editor3dPickUserData({ kind: "roofBatten", entityId, reactKey });
  const edgeV = FLOOR_BEAM_PROFILE_EDGES_3D.edges;

  return (
    <group>
      <mesh position={c} quaternion={q} castShadow receiveShadow userData={pick}>
        <boxGeometry args={[qw, qh, qd]} />
        <meshStandardMaterial
          color={woodPreset.color}
          roughness={woodPreset.roughness}
          metalness={woodPreset.metalness}
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
          width={qw}
          height={qh}
          depth={qd}
          position={c}
          quaternion={b.quaternion}
          color={SELECTION_BOX_OUTLINE_3D.color}
          opacity={SELECTION_BOX_OUTLINE_3D.opacity}
        />
      ) : null}
      {hoverThis ? (
        <ExactBoxSelectionOutline
          width={qw}
          height={qh}
          depth={qd}
          position={c}
          quaternion={b.quaternion}
          color={HOVER_BOX_OUTLINE_3D.color}
          opacity={HOVER_BOX_OUTLINE_3D.opacity}
        />
      ) : null}
    </group>
  );
}

function CalculatedRoofPlaneMeshes({
  project,
  rp,
  zAdjustMm,
  selectedRoofBattenEntityId,
  hoverRoofBattenEntityId,
}: {
  readonly project: Project;
  readonly rp: RoofPlaneEntity;
  readonly zAdjustMm: number;
  readonly selectedRoofBattenEntityId: string | null;
  readonly hoverRoofBattenEntityId: string | null;
}) {
  const profile = getProfileById(project, rp.profileId);
  const asm = useMemo(() => resolveRoofProfileAssembly(profile ?? {}), [profile]);
  const layerBase = roofLayerBaseMmForPlane(project, rp.layerId);

  const baseMesh = useMemo(
    () => buildRoofSlopeSurfaceMeshMm(rp, layerBase, zAdjustMm),
    [rp, layerBase, zAdjustMm],
  );
  const membraneGeom = useMemo(() => {
    if (!baseMesh || !asm.membraneUse) {
      return null;
    }
    const m = offsetRoofMeshMm(baseMesh, -asm.membraneThicknessMm * 0.5);
    return roofMeshToWorldMeters(m);
  }, [baseMesh, asm.membraneUse, asm.membraneThicknessMm]);

  const coveringGeom = useMemo(() => {
    if (!baseMesh) {
      return null;
    }
    const mem = asm.membraneUse ? asm.membraneThicknessMm : 0;
    const batt = asm.battenUse ? asm.battenHeightMm : 0;
    const off = mem + batt + asm.coveringThicknessMm * 0.5;
    const m = offsetRoofMeshMm(baseMesh, off);
    return roofMeshToWorldMeters(m);
  }, [baseMesh, asm.membraneUse, asm.membraneThicknessMm, asm.battenUse, asm.battenHeightMm, asm.coveringThicknessMm]);

  const battenSpecs = useMemo(
    () => (baseMesh && asm.battenUse ? buildRoofBattenBoxSpecsMm(rp, layerBase, asm, zAdjustMm) : []),
    [baseMesh, asm, rp, layerBase, zAdjustMm],
  );

  const membraneThree = useMemo(() => {
    if (!membraneGeom) {
      return null;
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(membraneGeom.positions, 3));
    g.setIndex(Array.from(membraneGeom.indices));
    g.computeVertexNormals();
    return g;
  }, [membraneGeom]);

  const coveringThree = useMemo(() => {
    if (!coveringGeom) {
      return null;
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(coveringGeom.positions, 3));
    g.setIndex(Array.from(coveringGeom.indices));
    g.computeVertexNormals();
    return g;
  }, [coveringGeom]);

  useEffect(() => {
    return () => {
      membraneThree?.dispose();
      coveringThree?.dispose();
    };
  }, [membraneThree, coveringThree]);

  const vs = project.viewState;
  const roofOn = vs.show3dRoof !== false;
  const showMem = roofOn && vs.show3dRoofMembrane !== false && asm.membraneUse;
  const showBat = roofOn && vs.show3dRoofBattens !== false && asm.battenUse;
  const showCov = roofOn && vs.show3dRoofCovering !== false;

  const membranePreset = meshStandardPresetForMaterialType("membrane");
  const woodPreset = meshStandardPresetForMaterialType("wood");
  const covColor = parseHexColor(asm.coveringColorHex);
  const texturePlaceholder = asm.coveringAppearance3d === "texture";

  return (
    <group name={`roof-plane-${rp.id}`}>
      {showMem && membraneThree ? (
        <mesh geometry={membraneThree} castShadow receiveShadow>
          <meshStandardMaterial
            color={membranePreset.color}
            roughness={membranePreset.roughness}
            metalness={membranePreset.metalness}
            side={DoubleSide}
          />
        </mesh>
      ) : null}
      {showBat
        ? battenSpecs.map((b, i) => {
            const entityId = roofBattenPickEntityId(rp.id, i);
            return (
              <RoofBattenBoardMesh3d
                key={roofBattenPickReactKey(rp.id, i)}
                planeId={rp.id}
                battenIndex={i}
                b={b}
                woodPreset={woodPreset}
                selected={selectedRoofBattenEntityId === entityId}
                hoverThis={hoverRoofBattenEntityId === entityId}
              />
            );
          })
        : null}
      {showCov && coveringThree ? (
        <mesh geometry={coveringThree} castShadow receiveShadow>
          <meshStandardMaterial
            color={texturePlaceholder ? 0xa8b4c4 : covColor}
            roughness={texturePlaceholder ? 0.88 : 0.42}
            metalness={texturePlaceholder ? 0.06 : 0.35}
            side={DoubleSide}
          />
        </mesh>
      ) : null}
    </group>
  );
}

export interface ProjectRoofAssemblyProps {
  readonly project: Project;
  readonly selectedRoofBattenEntityId: string | null;
  readonly hoverRoofBattenEntityId: string | null;
}

/** 3D-узел кровли: только скаты, отмеченные расчётом; подслои по профилю кровли. */
export function ProjectRoofAssembly({
  project,
  selectedRoofBattenEntityId,
  hoverRoofBattenEntityId,
}: ProjectRoofAssemblyProps) {
  const calculatedIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of project.roofAssemblyCalculations) {
      for (const id of c.roofPlaneIds) {
        s.add(id);
      }
    }
    return s;
  }, [project.roofAssemblyCalculations]);

  const planes = useMemo(
    () => project.roofPlanes.filter((r) => calculatedIds.has(r.id)),
    [project.roofPlanes, calculatedIds],
  );

  const zAdjustByPlaneId = useMemo(() => roofAssemblyZAdjustMmByPlaneIdForProject(project), [project]);

  if (planes.length === 0) {
    return null;
  }

  return (
    <group name="project-roof-assembly">
      {planes.map((rp) => (
        <CalculatedRoofPlaneMeshes
          key={rp.id}
          project={project}
          rp={rp}
          zAdjustMm={zAdjustByPlaneId.get(rp.id) ?? 0}
          selectedRoofBattenEntityId={selectedRoofBattenEntityId}
          hoverRoofBattenEntityId={hoverRoofBattenEntityId}
        />
      ))}
    </group>
  );
}
