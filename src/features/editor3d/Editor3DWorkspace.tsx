import { OrbitControls, Grid } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

import { useAppStore } from "@/store/useAppStore";

import { ProjectWalls } from "./ProjectWalls";

function SceneFromProject() {
  const project = useAppStore((s) => s.currentProject);
  return <ProjectWalls project={project} />;
}

export function Editor3DWorkspace() {
  const showLayers = useAppStore((s) => s.currentProject.viewState.show3dProfileLayers);
  const setShow3dProfileLayers = useAppStore((s) => s.setShow3dProfileLayers);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 0 }}>
      <label
        style={{
          position: "absolute",
          zIndex: 1,
          top: 10,
          left: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 6,
          background: "rgba(15, 18, 24, 0.82)",
          color: "#e6e9ef",
          fontSize: 13,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <input
          type="checkbox"
          checked={showLayers}
          onChange={(e) => setShow3dProfileLayers(e.target.checked)}
        />
        Слои профиля в 3D
      </label>
      <Canvas
        shadows
        camera={{ position: [12, 9, 12], fov: 45, near: 0.1, far: 500 }}
        style={{ width: "100%", height: "100%", minHeight: 0 }}
      >
        <color attach="background" args={["#0b0d12"]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[14, 18, 12]} intensity={1.05} castShadow />
        <Grid
          infiniteGrid
          fadeDistance={120}
          sectionSize={1}
          cellSize={0.2}
          sectionColor="#3d4454"
          cellColor="#252a35"
          position={[0, 0, 0]}
        />
        <axesHelper args={[4]} />
        <SceneFromProject />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      </Canvas>
    </div>
  );
}
