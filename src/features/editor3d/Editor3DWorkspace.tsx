import { OrbitControls, Grid } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";

import type { Opening3dMeshSpec } from "@/core/domain/opening3dAssemblySpecs";
import { formatLumberDisplayMark, lumberDisplayIndexByPieceId } from "@/core/domain/pieceDisplayMark";
import { buildCalculationSolidSpecsForProject } from "@/core/domain/wallCalculation3dSpecs";
import { lumberRoleLabelRu } from "@/core/domain/wallSpecification";
import { useAppStore } from "@/store/useAppStore";

import { Editor3dVisibilityPanel } from "./Editor3dVisibilityPanel";
import { ProjectCalculationMeshes } from "./ProjectCalculationMeshes";
import { ProjectOpeningMeshes } from "./ProjectOpeningMeshes";
import { ProjectSipSeamLines } from "./ProjectSipSeamLines";
import { ProjectWalls } from "./ProjectWalls";
import { useEditor3dThemeColors } from "./useEditor3dThemeColors";
import type { WallRenderMeshSpec } from "./wallMeshSpec";

type Selected3d =
  | { kind: "calc"; reactKey: string; spec: ReturnType<typeof buildCalculationSolidSpecsForProject>[number] }
  | { kind: "opening"; reactKey: string; spec: Opening3dMeshSpec }
  | { kind: "wall"; reactKey: string; spec: WallRenderMeshSpec }
  | null;

function SceneFromProject({
  selected,
  onSelectCalculation,
  onSelectOpening,
  onSelectWall,
}: {
  readonly selected: Selected3d;
  readonly onSelectCalculation: (s: ReturnType<typeof buildCalculationSolidSpecsForProject>[number]) => void;
  readonly onSelectOpening: (s: Opening3dMeshSpec) => void;
  readonly onSelectWall: (s: WallRenderMeshSpec) => void;
}) {
  const project = useAppStore((s) => s.currentProject);
  const showCalc = project.viewState.show3dCalculation !== false;
  const vs = project.viewState;
  const showSipSeamLines =
    showCalc && (vs.show3dLayerEps !== false || vs.show3dLayerOsb !== false);
  return (
    <>
      <ProjectWalls
        project={project}
        selectedReactKey={selected?.kind === "wall" ? selected.reactKey : null}
        onSelectWall={onSelectWall}
      />
      <ProjectCalculationMeshes
        project={project}
        visible={showCalc}
        selectedReactKey={selected?.kind === "calc" ? selected.reactKey : null}
        onSelect={onSelectCalculation}
      />
      <ProjectSipSeamLines project={project} visible={showSipSeamLines} />
      <ProjectOpeningMeshes
        project={project}
        selectedReactKey={selected?.kind === "opening" ? selected.reactKey : null}
        onSelect={onSelectOpening}
      />
    </>
  );
}

export function Editor3DWorkspace() {
  const showLayers = useAppStore((s) => s.currentProject.viewState.show3dProfileLayers);
  const setShow3dProfileLayers = useAppStore((s) => s.setShow3dProfileLayers);
  const showCalc = useAppStore((s) => s.currentProject.viewState.show3dCalculation);
  const setShow3dCalculation = useAppStore((s) => s.setShow3dCalculation);
  const theme3d = useEditor3dThemeColors();
  const project = useAppStore((s) => s.currentProject);
  const [selected3d, setSelected3d] = useState<Selected3d>(null);

  const selectedInfo = useMemo(() => {
    if (!selected3d) {
      return null;
    }
    if (selected3d.kind === "opening") {
      const s = selected3d.spec;
      return {
        title: "Проём/обрамление",
        rows: [
          ["ID", s.reactKey],
          ["Тип", s.kind],
          ["Стенa", s.wallId],
          ["Проём", s.openingId],
          ["Ширина", `${Math.round(s.width * 1000)} мм`],
          ["Высота", `${Math.round(s.height * 1000)} мм`],
          ["Длина", `${Math.round(s.depth * 1000)} мм`],
        ] as const,
      };
    }
    if (selected3d.kind === "wall") {
      const s = selected3d.spec;
      return {
        title: "SIP-панель",
        rows: [
          ["ID", s.reactKey],
          ["Категория", "sip"],
          ["Стена", s.wallId],
          ["Расчёт", project.wallCalculations.find((c) => c.wallId === s.wallId)?.id ?? "—"],
          ["Деталь", s.layerId ?? "shell"],
          ["Роль", s.materialType],
          ["Ширина", `${Math.round(s.width * 1000)} мм`],
          ["Высота", `${Math.round(s.height * 1000)} мм`],
          ["Длина", `${Math.round(s.depth * 1000)} мм`],
        ] as const,
      };
    }
    const s = selected3d.spec;
    const calc = project.wallCalculations.find((c) => c.id === s.calculationId);
    const piece = s.pieceId ? calc?.lumberPieces.find((p) => p.id === s.pieceId) : undefined;
    const lumberIdx = calc && piece ? lumberDisplayIndexByPieceId(calc.lumberPieces).get(piece.id) : undefined;
    const detailLabel =
      piece && lumberIdx != null
        ? formatLumberDisplayMark(piece.wallMark, lumberIdx)
        : s.source === "sip"
          ? "—"
          : s.pieceId ?? "—";
    return {
      title: "Расчётный элемент",
      rows: [
        ["ID", s.reactKey],
        ["Категория", s.source],
        ["Стенa", s.wallId],
        ["Расчёт", s.calculationId],
        ["Деталь", detailLabel],
        ["Роль", piece ? lumberRoleLabelRu(piece.role) : "—"],
        ["Ширина", `${Math.round(s.width * 1000)} мм`],
        ["Высота", `${Math.round(s.height * 1000)} мм`],
        ["Длина", `${Math.round(s.depth * 1000)} мм`],
      ] as const,
    };
  }, [project.wallCalculations, selected3d]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 0 }}>
      <Editor3dVisibilityPanel />
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
          border: "1px solid var(--color-border-subtle)",
          background: theme3d.overlayBg,
          color: theme3d.overlayText,
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
      <label
        style={{
          position: "absolute",
          zIndex: 1,
          top: 48,
          left: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid var(--color-border-subtle)",
          background: theme3d.overlayBg,
          color: theme3d.overlayText,
          fontSize: 13,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <input
          type="checkbox"
          checked={showCalc !== false}
          onChange={(e) => setShow3dCalculation(e.target.checked)}
        />
        Расчёт в 3D (SIP и доски)
      </label>
      <Canvas
        shadows
        camera={{ position: [12, 9, 12], fov: 45, near: 0.1, far: 500 }}
        style={{ width: "100%", height: "100%", minHeight: 0 }}
        onPointerMissed={() => setSelected3d(null)}
      >
        <color attach="background" args={[theme3d.bg]} />
        {/* Мягкий fill + нейтральный ключ: меньше «чёрных» провалов на дереве без потери объёма */}
        <ambientLight intensity={0.58} />
        <hemisphereLight color="#e8eef4" groundColor="#7a6a58" intensity={0.45} />
        <directionalLight
          position={[14, 18, 12]}
          intensity={0.78}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={90}
          shadow-camera-left={-28}
          shadow-camera-right={28}
          shadow-camera-top={28}
          shadow-camera-bottom={-28}
          shadow-bias={-0.00015}
        />
        <directionalLight position={[-10, 8, -6]} intensity={0.22} />
        <Grid
          infiniteGrid
          fadeDistance={120}
          sectionSize={1}
          cellSize={0.2}
          sectionColor={theme3d.section}
          cellColor={theme3d.cell}
          position={[0, 0, 0]}
        />
        <axesHelper args={[4]} />
        <SceneFromProject
          selected={selected3d}
          onSelectCalculation={(s) => setSelected3d({ kind: "calc", reactKey: s.reactKey, spec: s })}
          onSelectOpening={(s) => setSelected3d({ kind: "opening", reactKey: s.reactKey, spec: s })}
          onSelectWall={(s) => setSelected3d({ kind: "wall", reactKey: s.reactKey, spec: s })}
        />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      </Canvas>
      {selectedInfo ? (
        <div
          style={{
            position: "absolute",
            right: 12,
            top: 10,
            zIndex: 2,
            width: 280,
            borderRadius: 8,
            border: "1px solid var(--color-border-subtle)",
            background: theme3d.overlayBg,
            color: theme3d.overlayText,
            padding: "10px 12px",
            fontSize: 12,
            lineHeight: 1.35,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{selectedInfo.title}</div>
          {selectedInfo.rows.map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
              <div style={{ opacity: 0.74, minWidth: 70 }}>{k}</div>
              <div style={{ wordBreak: "break-word" }}>{v}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
