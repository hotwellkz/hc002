import { OrbitControls, Grid } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

import { PlaceholderVolume } from "./PlaceholderVolume";

export function Editor3DWorkspace() {
  return (
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
      <PlaceholderVolume />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}
