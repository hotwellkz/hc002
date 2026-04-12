import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useRef, type RefObject } from "react";
import type { Group } from "three";
import * as THREE from "three";

import type { Project } from "@/core/domain/project";
import { viewport3dForCoverCorner, type CoverCameraCorner } from "@/core/reports/renderers/coverCamera";
import { getCoverRenderPixelSize } from "@/core/reports/renderers/renderProjectCoverImage";
import { ReportCoverProjectSceneContent } from "@/features/editor3d/Editor3dProjectSceneContent";
import { planTargetMmToThreeVector } from "@/features/editor3d/viewport3dThreeSync";

import type { CoverBackgroundKey } from "./coverSnapshotConstants";
import { COVER_BG_HEX } from "./coverSnapshotConstants";

const MM = 0.001;

function GlPixelSizeSync({ width, height }: { readonly width: number; readonly height: number }) {
  const { gl } = useThree();
  useLayoutEffect(() => {
    gl.setPixelRatio(1);
    gl.setSize(width, height, false);
  }, [gl, height, width]);
  return null;
}

function CoverSnapshotCapture({
  modelRef,
  corner,
  onCaptured,
}: {
  readonly modelRef: RefObject<Group | null>;
  readonly corner: CoverCameraCorner;
  readonly onCaptured: (dataUrl: string | null) => void;
}) {
  const { camera, gl, scene, size } = useThree();
  const frame = useRef(0);
  const done = useRef(false);

  useFrame(() => {
    if (done.current) {
      return;
    }
    frame.current += 1;
    if (frame.current < 5) {
      return;
    }
    const cam = camera as THREE.PerspectiveCamera;
    const box = new THREE.Box3();
    const root = modelRef.current;
    if (root) {
      box.setFromObject(root);
    }
    if (box.isEmpty()) {
      box.set(new THREE.Vector3(-8, 0, -8), new THREE.Vector3(8, 12, 8));
    }

    const aspect = size.width / Math.max(1, size.height);
    const v = viewport3dForCoverCorner(box, corner, cam.fov, aspect);
    const target = planTargetMmToThreeVector(v);
    const sph = new THREE.Spherical(v.distance * MM, v.polarAngle, v.azimuthalAngle);
    const off = new THREE.Vector3().setFromSpherical(sph);
    cam.position.copy(target).add(off);
    cam.near = 0.05;
    cam.far = 800;
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    gl.render(scene, cam);
    try {
      const url = gl.domElement.toDataURL("image/png");
      done.current = true;
      onCaptured(url);
    } catch {
      done.current = true;
      onCaptured(null);
    }
  });

  return null;
}

function CoverScene({
  project,
  originXM,
  originZM,
  corner,
  onCaptured,
}: {
  readonly project: Project;
  readonly originXM: number;
  readonly originZM: number;
  readonly corner: CoverCameraCorner;
  readonly onCaptured: (dataUrl: string | null) => void;
}) {
  const modelRef = useRef<THREE.Group>(null);
  return (
    <>
      <ambientLight intensity={0.52} />
      <hemisphereLight color="#eef2f7" groundColor="#6b6055" intensity={0.44} />
      <directionalLight position={[14, 22, 11]} intensity={0.72} castShadow shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[-10, 12, -9]} intensity={0.2} />
      <Suspense fallback={null}>
        <group ref={modelRef} position={[originXM, 0, originZM]}>
          <ReportCoverProjectSceneContent project={project} />
        </group>
      </Suspense>
      <CoverSnapshotCapture modelRef={modelRef} corner={corner} onCaptured={onCaptured} />
    </>
  );
}

export interface ProjectCoverSnapshotCanvasProps {
  readonly project: Project;
  readonly corner: CoverCameraCorner;
  readonly background: CoverBackgroundKey;
  readonly onCaptured: (dataUrl: string | null) => void;
}

/**
 * Изолированный WebGL-рендер обложки (не связан с редактором 3D).
 */
export function ProjectCoverSnapshotCanvas({ project, corner, background, onCaptured }: ProjectCoverSnapshotCanvasProps) {
  const { width, height } = getCoverRenderPixelSize();
  const bg = COVER_BG_HEX[background];
  const originXM = (project.projectOrigin?.x ?? 0) * MM;
  const originZM = -(project.projectOrigin?.y ?? 0) * MM;

  return (
    <div
      aria-hidden
      className="report-cover-snapshot-root"
      style={{ position: "fixed", left: -9999, top: 0, width, height, overflow: "hidden", pointerEvents: "none" }}
    >
      <Canvas
        shadows
        gl={{ preserveDrawingBuffer: true, antialias: true, alpha: false }}
        camera={{ fov: 42, near: 0.08, far: 600, position: [3, 4, 5] }}
        dpr={1}
        style={{ width, height }}
        frameloop="always"
      >
        <GlPixelSizeSync width={width} height={height} />
        <color attach="background" args={[bg]} />
        <CoverScene project={project} originXM={originXM} originZM={originZM} corner={corner} onCaptured={onCaptured} />
      </Canvas>
    </div>
  );
}
