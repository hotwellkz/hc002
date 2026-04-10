import { useEffect, useMemo } from "react";
import { BoxGeometry, EdgesGeometry } from "three";

/**
 * Рёбра прямоугольного объёма с теми же width/height/depth и transform, что у основного mesh
 * (без масштаба 1.015 и без wireframe с лишними диагоналями).
 */
export function ExactBoxSelectionOutline({
  width,
  height,
  depth,
  position,
  rotationY,
  color,
  opacity,
}: {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
  readonly color: number;
  readonly opacity: number;
}) {
  const geometry = useMemo(() => {
    const box = new BoxGeometry(width, height, depth);
    const edges = new EdgesGeometry(box, 1);
    box.dispose();
    return edges;
  }, [width, height, depth]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments
      geometry={geometry}
      position={position}
      rotation={[0, rotationY, 0]}
      raycast={() => null}
      frustumCulled={false}
      renderOrder={32}
    >
      <lineBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthTest
        depthWrite={false}
      />
    </lineSegments>
  );
}
