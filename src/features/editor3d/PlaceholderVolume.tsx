/**
 * Упрощённый «дом» для проверки сцены: масштаб условный (1 ед. ≈ 1 м), без привязки к domain.
 */
export function PlaceholderVolume() {
  return (
    <group position={[0, 1.4, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[8, 2.8, 6]} />
        <meshStandardMaterial color="#4dabf7" roughness={0.45} metalness={0.05} />
      </mesh>
      <mesh position={[0, 2.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[8.6, 0.35, 6.6]} />
        <meshStandardMaterial color="#4dabf7" roughness={0.45} metalness={0.05} />
      </mesh>
    </group>
  );
}
