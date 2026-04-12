import { useEffect, useMemo } from "react";
import { BoxGeometry, EdgesGeometry, Quaternion } from "three";

/**
 * Рёбра прямоугольного объёма с теми же width/height/depth и transform, что у основного mesh
 * (без масштаба 1.015 и без wireframe с лишними диагоналями).
 */
export function ExactBoxSelectionOutline({
  width,
  height,
  depth,
  position,
  rotationY = 0,
  quaternion,
  color,
  opacity,
}: {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly position: readonly [number, number, number];
  /** Игнорируется, если задан `quaternion`. */
  readonly rotationY?: number;
  /** Полный ориент бокса (например обрешётка на скате). */
  readonly quaternion?: readonly [number, number, number, number];
  readonly color: number;
  readonly opacity: number;
}) {
  const geometry = useMemo(() => {
    const box = new BoxGeometry(width, height, depth);
    const edges = new EdgesGeometry(box, 1);
    box.dispose();
    return edges;
  }, [width, height, depth]);

  const qObj = useMemo(() => {
    if (!quaternion) {
      return null;
    }
    return new Quaternion(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
  }, [quaternion]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const mat = (
    <lineBasicMaterial color={color} transparent opacity={opacity} depthTest depthWrite={false} />
  );

  if (qObj) {
    return (
      <group position={position} quaternion={qObj}>
        <lineSegments geometry={geometry} raycast={() => null} frustumCulled={false} renderOrder={32}>
          {mat}
        </lineSegments>
      </group>
    );
  }

  return (
    <lineSegments
      geometry={geometry}
      position={position}
      rotation={[0, rotationY, 0]}
      raycast={() => null}
      frustumCulled={false}
      renderOrder={32}
    >
      {mat}
    </lineSegments>
  );
}
