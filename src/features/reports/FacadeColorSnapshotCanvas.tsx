import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import type { Group } from "three";
import * as THREE from "three";

import type { Project } from "@/core/domain/project";
import type { ElevationCardinal } from "@/core/reports/geometry/elevation2d";
import { fitOrthoCameraForElevation, getHouseReportRasterPixelSize } from "@/core/reports/renderers/houseReportSnapshot";
import { ReportCoverProjectSceneContent } from "@/features/editor3d/Editor3dProjectSceneContent";

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

function FacadeGroundLine({
  modelRef,
  cardinal,
}: {
  readonly modelRef: RefObject<Group | null>;
  readonly cardinal: ElevationCardinal;
}) {
  const pos = useMemo(() => new Float32Array(6), []);
  const lineObj = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = new THREE.LineBasicMaterial({ color: "#c4c4cc" });
    return new THREE.Line(g, m);
  }, [pos]);

  useFrame(() => {
    const root = modelRef.current;
    if (!root) {
      return;
    }
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) {
      return;
    }
    const c = new THREE.Vector3();
    box.getCenter(c);
    const y = box.min.y + 0.012;
    if (cardinal === "front" || cardinal === "back") {
      pos.set([box.min.x, y, c.z, box.max.x, y, c.z]);
    } else {
      pos.set([c.x, y, box.min.z, c.x, y, box.max.z]);
    }
    const g = lineObj.geometry as THREE.BufferGeometry;
    (g.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }, -1);

  return <primitive object={lineObj} />;
}

function FacadeSnapshotCapture({
  modelRef,
  cardinal,
  onCaptured,
}: {
  readonly modelRef: RefObject<Group | null>;
  readonly cardinal: ElevationCardinal;
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
    const cam = camera as THREE.OrthographicCamera;
    const box = new THREE.Box3();
    const root = modelRef.current;
    if (root) {
      box.setFromObject(root);
    }
    if (box.isEmpty()) {
      box.set(new THREE.Vector3(-8, 0, -8), new THREE.Vector3(8, 12, 8));
    }

    const aspect = size.width / Math.max(1, size.height);
    fitOrthoCameraForElevation(cam, box, cardinal, aspect);
    gl.render(scene, cam);
    try {
      const url = gl.domElement.toDataURL("image/png");
      done.current = true;
      onCaptured(url);
    } catch {
      done.current = true;
      onCaptured(null);
    }
  }, 0);

  return null;
}

function FacadeScene({
  project,
  originXM,
  originZM,
  cardinal,
  onCaptured,
}: {
  readonly project: Project;
  readonly originXM: number;
  readonly originZM: number;
  readonly cardinal: ElevationCardinal;
  readonly onCaptured: (dataUrl: string | null) => void;
}) {
  const modelRef = useRef<THREE.Group>(null);
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight color="#f0f4f8" groundColor="#6b6055" intensity={0.48} />
      <directionalLight position={[16, 26, 14]} intensity={0.68} castShadow shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[-12, 14, -10]} intensity={0.22} />
      <Suspense fallback={null}>
        <group ref={modelRef} position={[originXM, 0, originZM]}>
          <ReportCoverProjectSceneContent project={project} />
        </group>
      </Suspense>
      <FacadeGroundLine modelRef={modelRef} cardinal={cardinal} />
      <FacadeSnapshotCapture modelRef={modelRef} cardinal={cardinal} onCaptured={onCaptured} />
    </>
  );
}

export interface FacadeColorSnapshotCanvasProps {
  readonly project: Project;
  readonly cardinal: ElevationCardinal;
  readonly background: CoverBackgroundKey;
  readonly onCaptured: (dataUrl: string | null) => void;
}

/**
 * Ортогональный цветной фасад: та же 3D-модель и материалы, что у обложки «3D вид дома».
 */
export function FacadeColorSnapshotCanvas({ project, cardinal, background, onCaptured }: FacadeColorSnapshotCanvasProps) {
  const { width, height } = getHouseReportRasterPixelSize();
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
        orthographic
        shadows
        gl={{ preserveDrawingBuffer: true, antialias: true, alpha: false }}
        camera={{ position: [0, 4, 12], near: 0.05, far: 8000, zoom: 1 }}
        dpr={1}
        style={{ width, height }}
        frameloop="always"
      >
        <GlPixelSizeSync width={width} height={height} />
        <color attach="background" args={[bg]} />
        <FacadeScene
          project={project}
          originXM={originXM}
          originZM={originZM}
          cardinal={cardinal}
          onCaptured={onCaptured}
        />
      </Canvas>
    </div>
  );
}
