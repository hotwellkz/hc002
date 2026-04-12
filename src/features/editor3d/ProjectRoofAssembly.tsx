import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide, Quaternion } from "three";

import { getProfileById } from "@/core/domain/profileOps";
import type { Project } from "@/core/domain/project";
import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import { computeRoofGroupZAdjustMmByPlaneId } from "@/core/domain/roofGroupHeightAdjust";
import { resolveRoofProfileAssembly } from "@/core/domain/roofProfileAssembly";
import {
  buildRoofBattenBoxSpecsMm,
  buildRoofSlopeSurfaceMeshMm,
  offsetRoofMeshMm,
  roofBattenCenterWorldM,
  roofLayerBaseMmForPlane,
  roofMeshToWorldMeters,
} from "@/core/geometry/roofAssemblyGeometry3d";

import { meshStandardPresetForMaterialType } from "./materials3d";

function parseHexColor(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) {
    return 0x888888;
  }
  return parseInt(m[1]!, 16);
}

function CalculatedRoofPlaneMeshes({
  project,
  rp,
  zAdjustMm,
}: {
  readonly project: Project;
  readonly rp: RoofPlaneEntity;
  readonly zAdjustMm: number;
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
            const c = roofBattenCenterWorldM(b);
            const q = new Quaternion(b.quaternion[0], b.quaternion[1], b.quaternion[2], b.quaternion[3]);
            const qw = b.widthMm * 0.001;
            const qh = b.heightMm * 0.001;
            const qd = b.lengthMm * 0.001;
            return (
              <mesh key={`${rp.id}-bat-${i}`} position={c} quaternion={q} castShadow receiveShadow>
                <boxGeometry args={[qw, qh, qd]} />
                <meshStandardMaterial
                  color={woodPreset.color}
                  roughness={woodPreset.roughness}
                  metalness={woodPreset.metalness}
                />
              </mesh>
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
}

/** 3D-узел кровли: только скаты, отмеченные расчётом; подслои по профилю кровли. */
export function ProjectRoofAssembly({ project }: ProjectRoofAssemblyProps) {
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

  const zAdjustByPlaneId = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of project.roofAssemblyCalculations) {
      const group: RoofPlaneEntity[] = [];
      for (const id of c.roofPlaneIds) {
        const rp = project.roofPlanes.find((p) => p.id === id);
        if (rp) {
          group.push(rp);
        }
      }
      if (group.length === 0) {
        continue;
      }
      const adj = computeRoofGroupZAdjustMmByPlaneId(group, (layerId) => roofLayerBaseMmForPlane(project, layerId));
      for (const [id, z] of adj) {
        m.set(id, z);
      }
    }
    return m;
  }, [project]);

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
        />
      ))}
    </group>
  );
}
