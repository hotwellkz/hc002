import { Grid } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatLumberDisplayMark, lumberDisplayIndexByPieceId } from "@/core/domain/pieceDisplayMark";
import { buildCalculationSolidSpecsForProject } from "@/core/domain/wallCalculation3dSpecs";
import { lumberRoleLabelRu } from "@/core/domain/wallSpecification";
import { hasBlockingEditorOverlayModal } from "@/shared/editorToolShortcuts/shouldIgnoreEditorToolHotkeys";
import { isEditableKeyboardTarget } from "@/shared/editableKeyboardTarget";
import { useAppStore } from "@/store/useAppStore";

import { Editor3dFlyControls } from "./Editor3dFlyControls";
import { Editor3dOrbitControls } from "./Editor3dOrbitControls";
import { Editor3dOrbitPivotCoordinator } from "./Editor3dOrbitPivotCoordinator";
import { Editor3dPickController } from "./Editor3dPickController";
import { Editor3dPivotMarker } from "./Editor3dPivotMarker";
import { Editor3dVisibilityPanel } from "./Editor3dVisibilityPanel";
import type { Editor3dPickPayload } from "./editor3dPick";
import { initialCameraPositionFromViewport3d } from "./viewport3dThreeSync";
import { ProjectCalculationMeshes } from "./ProjectCalculationMeshes";
import { ProjectOpeningMeshes } from "./ProjectOpeningMeshes";
import { ProjectSipSeamLines } from "./ProjectSipSeamLines";
import { ProjectWalls } from "./ProjectWalls";
import { useEditor3dThemeColors } from "./useEditor3dThemeColors";

type CalcFocus = { readonly wallId: string; readonly reactKey: string };

/** Иконка «мишень» / фокус для вращения вокруг точки. */
function IconOrbitAroundPoint() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.75" />
      <path
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21"
      />
      <path stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" d="M5.6 5.6l1.5 1.5m10.3 10.3l1.5 1.5m0-13.4l-1.5 1.5M7.1 16.9l-1.5 1.5" />
    </svg>
  );
}

/** Иконка «человечек» для режима обхода (упрощённый силуэт). */
function IconWalkPerson() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <circle cx="12" cy="5.5" r="2.2" />
      <path d="M12 8.2c-1.4 0-2.6 1-2.8 2.3L8.4 17c-.1.6.4 1.1 1 1.1s.9-.4 1-.9l.6-4.2h.8l.6 4.2c.1.5.5.9 1 .9s1.1-.5 1-1.1l-.8-6.5c-.2-1.3-1.4-2.3-2.8-2.3z" />
      <path d="M8.2 10.5L6.4 9.1c-.4-.3-1-.2-1.2.2s-.1.9.3 1.2l2.2 1.6c.3.2.7.2 1 0l1.1-.8-1.8-1.3-.6.5zm7.6 0l.6-.5-1.8 1.3 1.1.8c.3.2.7.2 1 0l2.2-1.6c.4-.3.5-.8.3-1.2s-.8-.5-1.2-.2l-1.8 1.4z" />
    </svg>
  );
}

function editorOverlaySnapshot() {
  const s = useAppStore.getState();
  return {
    activeTab: s.activeTab,
    layerManagerOpen: s.layerManagerOpen,
    layerParamsModalOpen: s.layerParamsModalOpen,
    profilesModalOpen: s.profilesModalOpen,
    addWallModalOpen: s.addWallModalOpen,
    addWindowModalOpen: s.addWindowModalOpen,
    addDoorModalOpen: s.addDoorModalOpen,
    windowEditModal: s.windowEditModal,
    doorEditModal: s.doorEditModal,
    wallJointParamsModalOpen: s.wallJointParamsModalOpen,
    wallCalculationModalOpen: s.wallCalculationModalOpen,
    wallCoordinateModalOpen: s.wallCoordinateModalOpen,
    wallAnchorCoordinateModalOpen: s.wallAnchorCoordinateModalOpen,
    wallMoveCopyCoordinateModalOpen: s.wallMoveCopyCoordinateModalOpen,
    lengthChangeCoordinateModalOpen: s.lengthChangeCoordinateModalOpen,
    projectOriginCoordinateModalOpen: s.projectOriginCoordinateModalOpen,
    openingAlongMoveNumericModalOpen: s.openingAlongMoveNumericModalOpen,
  };
}

function SceneFromProject({
  selectedWallEntityId,
  selectedOpeningEntityId,
  calcFocus,
  hoverWallEntityId,
  hoverOpeningEntityId,
  hoverCalcReactKey,
}: {
  readonly selectedWallEntityId: string | null;
  readonly selectedOpeningEntityId: string | null;
  readonly calcFocus: CalcFocus | null;
  readonly hoverWallEntityId: string | null;
  readonly hoverOpeningEntityId: string | null;
  readonly hoverCalcReactKey: string | null;
}) {
  const project = useAppStore((s) => s.currentProject);
  const showCalc = project.viewState.show3dCalculation !== false;
  const vs = project.viewState;
  const showSipSeamLines = showCalc && (vs.show3dLayerEps !== false || vs.show3dLayerOsb !== false);
  return (
    <>
      <ProjectWalls
        project={project}
        selectedWallEntityId={selectedWallEntityId}
        calcFocus={calcFocus}
        hoverWallEntityId={hoverWallEntityId}
      />
      <ProjectCalculationMeshes
        project={project}
        visible={showCalc}
        calcFocus={calcFocus}
        hoverCalcReactKey={hoverCalcReactKey}
      />
      <ProjectSipSeamLines project={project} visible={showSipSeamLines} />
      <ProjectOpeningMeshes
        project={project}
        selectedOpeningEntityId={selectedOpeningEntityId}
        hoverOpeningEntityId={hoverOpeningEntityId}
      />
    </>
  );
}

function Editor3dCanvasScene({
  theme3d,
  originXM,
  originZM,
  calcFocus,
  setCalcFocus,
  onHoverPickChange,
  hoverWallEntityId,
  hoverOpeningEntityId,
  hoverCalcReactKey,
  flyModeActive,
  orbitPivotModeActive,
  pivotMarkerWorld,
  setPivotMarkerWorld,
}: {
  readonly theme3d: ReturnType<typeof useEditor3dThemeColors>;
  readonly originXM: number;
  readonly originZM: number;
  readonly calcFocus: CalcFocus | null;
  readonly setCalcFocus: (v: CalcFocus | null) => void;
  readonly onHoverPickChange: (p: Editor3dPickPayload | null) => void;
  readonly hoverWallEntityId: string | null;
  readonly hoverOpeningEntityId: string | null;
  readonly hoverCalcReactKey: string | null;
  readonly flyModeActive: boolean;
  readonly orbitPivotModeActive: boolean;
  readonly pivotMarkerWorld: readonly [number, number, number] | null;
  readonly setPivotMarkerWorld: (p: readonly [number, number, number] | null) => void;
}) {
  const project = useAppStore((s) => s.currentProject);
  const selectedEntityIds = useAppStore((s) => s.selectedEntityIds);

  const selectedWallEntityId = useMemo(() => {
    if (selectedEntityIds.length !== 1) {
      return null;
    }
    const id = selectedEntityIds[0]!;
    return project.walls.some((w) => w.id === id) ? id : null;
  }, [project.walls, selectedEntityIds]);

  const selectedOpeningEntityId = useMemo(() => {
    if (selectedEntityIds.length !== 1) {
      return null;
    }
    const id = selectedEntityIds[0]!;
    return project.openings.some((o) => o.id === id) ? id : null;
  }, [project.openings, selectedEntityIds]);

  return (
    <>
      <color attach="background" args={[theme3d.bg]} />
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
      <group position={[originXM, 0, originZM]} userData={{ editor3dExcludeFromOrbitPivot: true }}>
        <Grid
          infiniteGrid
          fadeDistance={120}
          sectionSize={1}
          cellSize={0.2}
          sectionColor={theme3d.section}
          cellColor={theme3d.cell}
          position={[0, 0, 0]}
        />
        <axesHelper args={[2.5]} />
      </group>
      <Editor3dPickController
        setCalcFocus={setCalcFocus}
        onHoverPickChange={onHoverPickChange}
        pickingSuspended={flyModeActive}
        deferClickSelection={orbitPivotModeActive && !flyModeActive}
      />
      <SceneFromProject
        selectedWallEntityId={selectedWallEntityId}
        selectedOpeningEntityId={selectedOpeningEntityId}
        calcFocus={calcFocus}
        hoverWallEntityId={hoverWallEntityId}
        hoverOpeningEntityId={hoverOpeningEntityId}
        hoverCalcReactKey={hoverCalcReactKey}
      />
      <Editor3dPivotMarker point={pivotMarkerWorld} />
      <Editor3dFlyControls enabled={flyModeActive} />
      <Editor3dOrbitControls flyModeActive={flyModeActive} />
      <Editor3dOrbitPivotCoordinator
        modeActive={orbitPivotModeActive}
        flyModeActive={flyModeActive}
        onPivotMarkerWorld={setPivotMarkerWorld}
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
  const selectedEntityIds = useAppStore((s) => s.selectedEntityIds);
  const activeTab = useAppStore((s) => s.activeTab);
  const clearSelection = useAppStore((s) => s.clearSelection);

  const originXM = (project.projectOrigin?.x ?? 0) * 0.001;
  const originZM = -(project.projectOrigin?.y ?? 0) * 0.001;
  const [calcFocus, setCalcFocus] = useState<CalcFocus | null>(null);
  const [hoverPick, setHoverPick] = useState<Editor3dPickPayload | null>(null);
  const [flyModeActive, setFlyModeActive] = useState(false);
  const [orbitPivotModeActive, setOrbitPivotModeActive] = useState(false);
  const [pivotMarkerWorld, setPivotMarkerWorld] = useState<readonly [number, number, number] | null>(null);
  const initialCameraPosRef = useRef<[number, number, number] | null>(null);
  if (initialCameraPosRef.current == null) {
    initialCameraPosRef.current = initialCameraPositionFromViewport3d(project.viewState.viewport3d);
  }

  const onHoverPickChange = useCallback((p: Editor3dPickPayload | null) => {
    setHoverPick(p);
  }, []);

  const hoverWallEntityId = hoverPick?.kind === "wall" ? hoverPick.entityId : null;
  const hoverOpeningEntityId = hoverPick?.kind === "opening" ? hoverPick.entityId : null;
  const hoverCalcReactKey = hoverPick?.kind === "calc" ? hoverPick.reactKey : null;

  useEffect(() => {
    if (calcFocus == null) {
      return;
    }
    if (selectedEntityIds.length !== 1 || selectedEntityIds[0] !== calcFocus.wallId) {
      setCalcFocus(null);
    }
  }, [calcFocus, selectedEntityIds]);

  useEffect(() => {
    if (activeTab !== "3d") {
      setCalcFocus(null);
      setHoverPick(null);
      setFlyModeActive(false);
      setOrbitPivotModeActive(false);
      setPivotMarkerWorld(null);
    }
  }, [activeTab]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== "Escape") {
        return;
      }
      if (activeTab !== "3d") {
        return;
      }
      if (isEditableKeyboardTarget(e.target)) {
        return;
      }
      if (hasBlockingEditorOverlayModal(editorOverlaySnapshot())) {
        return;
      }
      setCalcFocus(null);
      clearSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, clearSelection]);

  const onPointerMissedClear = useCallback(() => {
    setCalcFocus(null);
    clearSelection();
    setHoverPick(null);
  }, [clearSelection]);

  const selectedInfo = useMemo(() => {
    const ids = selectedEntityIds;
    if (ids.length !== 1) {
      return null;
    }
    const id = ids[0]!;

    if (calcFocus != null && id === calcFocus.wallId) {
      const specs = buildCalculationSolidSpecsForProject(project);
      const s = specs.find((x) => x.reactKey === calcFocus.reactKey);
      if (s) {
        const calc = project.wallCalculations.find((c) => c.id === s.calculationId);
        const piece = s.pieceId ? calc?.lumberPieces.find((p) => p.id === s.pieceId) : undefined;
        const lumberIdx = calc && piece ? lumberDisplayIndexByPieceId(calc.lumberPieces).get(piece.id) : undefined;
        const detailLabel =
          piece && lumberIdx != null
            ? formatLumberDisplayMark(piece.wallMark, lumberIdx)
            : s.source === "sip"
              ? "—"
              : (s.pieceId ?? "—");
        return {
          title: "Расчётный элемент",
          rows: [
            ["ID", s.reactKey],
            ["Категория", s.source],
            ["Стена", s.wallId],
            ["Расчёт", s.calculationId],
            ["Деталь", detailLabel],
            ["Роль", piece ? lumberRoleLabelRu(piece.role) : "—"],
            ["Ширина", `${Math.round(s.width * 1000)} мм`],
            ["Высота", `${Math.round(s.height * 1000)} мм`],
            ["Длина", `${Math.round(s.depth * 1000)} мм`],
          ] as const,
        };
      }
    }

    const opening = project.openings.find((o) => o.id === id);
    if (opening && opening.wallId != null) {
      return {
        title: opening.kind === "door" ? "Дверь" : opening.kind === "window" ? "Окно" : "Проём",
        rows: [
          ["ID", opening.id],
          ["Стена", opening.wallId],
          ["Ширина", `${opening.widthMm} мм`],
          ["Высота", `${opening.heightMm} мм`],
        ] as const,
      };
    }

    const wall = project.walls.find((w) => w.id === id);
    if (wall) {
      return {
        title: "Стена",
        rows: [
          ["ID", wall.id],
          ["Высота", `${wall.heightMm} мм`],
          ["Толщина", `${wall.thicknessMm} мм`],
        ] as const,
      };
    }

    return null;
  }, [calcFocus, project, selectedEntityIds]);

  const hoverTooltip = useMemo(() => {
    if (!hoverPick) {
      return null;
    }
    if (hoverPick.kind === "wall") {
      return "Стена";
    }
    if (hoverPick.kind === "calc") {
      return "Элемент расчёта";
    }
    const o = project.openings.find((x) => x.id === hoverPick.entityId);
    if (o?.kind === "door") {
      return "Дверь";
    }
    if (o?.kind === "window") {
      return "Окно";
    }
    return "Проём";
  }, [hoverPick, project.openings]);

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
        <input type="checkbox" checked={showLayers} onChange={(e) => setShow3dProfileLayers(e.target.checked)} />
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
        <input type="checkbox" checked={showCalc !== false} onChange={(e) => setShow3dCalculation(e.target.checked)} />
        Расчёт в 3D (SIP и доски)
      </label>
      <div
        style={{
          position: "absolute",
          zIndex: 2,
          top: 86,
          left: 10,
          display: "flex",
          flexDirection: "row",
          gap: 6,
        }}
      >
        <button
          type="button"
          title="Режим обхода 3D"
          aria-label="Режим обхода 3D"
          aria-pressed={flyModeActive}
          onClick={() => {
            setFlyModeActive((v) => {
              const next = !v;
              if (next) {
                setOrbitPivotModeActive(false);
              }
              return next;
            });
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 40,
            height: 34,
            padding: 0,
            borderRadius: 6,
            border: flyModeActive ? "2px solid var(--color-accent-outline, #5a9fff)" : "1px solid var(--color-border-subtle)",
            background: flyModeActive ? "var(--color-accent-soft, rgba(90, 167, 255, 0.18))" : theme3d.overlayBg,
            color: flyModeActive ? "var(--color-accent, #6eb0ff)" : theme3d.overlayText,
            cursor: "pointer",
            boxShadow: flyModeActive ? "0 0 0 1px var(--color-accent-outline, rgba(90, 167, 255, 0.35))" : undefined,
          }}
        >
          <IconWalkPerson />
        </button>
        <button
          type="button"
          title="Вращение вокруг точки. Зажмите ЛКМ по объекту и вращайте камеру вокруг точки попадания. Выключите режим, чтобы вернуться к прежней точке вращения."
          aria-label="Вращение вокруг точки"
          aria-pressed={orbitPivotModeActive}
          onClick={() => {
            setOrbitPivotModeActive((v) => {
              const next = !v;
              if (next) {
                setFlyModeActive(false);
              }
              return next;
            });
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 40,
            height: 34,
            padding: 0,
            borderRadius: 6,
            border: orbitPivotModeActive
              ? "2px solid var(--color-accent-outline, #5a9fff)"
              : "1px solid var(--color-border-subtle)",
            background: orbitPivotModeActive
              ? "var(--color-accent-soft, rgba(90, 167, 255, 0.18))"
              : theme3d.overlayBg,
            color: orbitPivotModeActive ? "var(--color-accent, #6eb0ff)" : theme3d.overlayText,
            cursor: "pointer",
            boxShadow: orbitPivotModeActive
              ? "0 0 0 1px var(--color-accent-outline, rgba(90, 167, 255, 0.35))"
              : undefined,
          }}
        >
          <IconOrbitAroundPoint />
        </button>
      </div>
      <Canvas
        shadows
        camera={{
          position: initialCameraPosRef.current,
          fov: 45,
          near: 0.1,
          far: 500,
        }}
        style={{ width: "100%", height: "100%", minHeight: 0 }}
        onPointerMissed={onPointerMissedClear}
      >
        <Editor3dCanvasScene
          theme3d={theme3d}
          originXM={originXM}
          originZM={originZM}
          calcFocus={calcFocus}
          setCalcFocus={setCalcFocus}
          onHoverPickChange={onHoverPickChange}
          hoverWallEntityId={hoverWallEntityId}
          hoverOpeningEntityId={hoverOpeningEntityId}
          hoverCalcReactKey={hoverCalcReactKey}
          flyModeActive={flyModeActive}
          orbitPivotModeActive={orbitPivotModeActive}
          pivotMarkerWorld={pivotMarkerWorld}
          setPivotMarkerWorld={setPivotMarkerWorld}
        />
      </Canvas>
      {flyModeActive ? (
        <div
          style={{
            position: "absolute",
            zIndex: 4,
            left: "50%",
            bottom: 52,
            transform: "translateX(-50%)",
            maxWidth: "min(520px, calc(100% - 24px))",
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border-subtle)",
            background: theme3d.overlayBg,
            color: theme3d.overlayText,
            fontSize: 11,
            lineHeight: 1.45,
            textAlign: "center",
            pointerEvents: "none",
            opacity: 0.92,
          }}
        >
          W/A/S/D — движение, Q/E — вверх/вниз, Shift — ускорение, Esc — выход
        </div>
      ) : orbitPivotModeActive ? (
        <div
          style={{
            position: "absolute",
            zIndex: 4,
            left: "50%",
            bottom: 52,
            transform: "translateX(-50%)",
            maxWidth: "min(520px, calc(100% - 24px))",
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border-subtle)",
            background: theme3d.overlayBg,
            color: theme3d.overlayText,
            fontSize: 11,
            lineHeight: 1.45,
            textAlign: "center",
            pointerEvents: "none",
            opacity: 0.92,
          }}
        >
          Зажмите ЛКМ по объекту, чтобы вращаться вокруг точки попадания
        </div>
      ) : null}
      {hoverTooltip ? (
        <div
          style={{
            position: "absolute",
            zIndex: 3,
            left: 16,
            bottom: 16,
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid var(--color-border-subtle)",
            background: theme3d.overlayBg,
            color: theme3d.overlayText,
            fontSize: 12,
            pointerEvents: "none",
          }}
        >
          {hoverTooltip}
        </div>
      ) : null}
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
