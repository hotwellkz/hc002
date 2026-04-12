import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { MeshStandardMaterial, type CanvasTexture } from "three";

import type { SurfaceTextureApplyMode } from "@/core/domain/surfaceTextureOps";
import { TEXTURE_CATALOG_CATEGORIES, getTextureCatalogEntry, textureCatalogEntriesForCategory } from "@/core/textures/textureCatalog";
import { getCatalogDiffuseTexture, getCatalogPreviewDataUrl } from "@/core/textures/proceduralDiffuseTextures";
import { finishStoreModalApply, storeModalApplyNoop, useModalApplyClose } from "@/shared/modalSubmit";
import { useAppStore } from "@/store/useAppStore";

import "./texture-apply-3d-modal.css";

function TexturePreviewCube({ texture }: { readonly texture: CanvasTexture }) {
  const mat = useMemo(() => {
    const m = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.52,
      metalness: 0.06,
    });
    const cm = texture.clone();
    cm.repeat.set(2.2, 2.2);
    cm.needsUpdate = true;
    m.map = cm;
    return m;
  }, [texture]);

  useEffect(() => {
    return () => {
      mat.map?.dispose();
      mat.dispose();
    };
  }, [mat]);

  return (
    <mesh material={mat} rotation={[0.45, 0.65, 0]}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}

export function TextureApply3dParamsModal() {
  const modal = useAppStore((s) => s.textureApply3dParamsModal);
  const apply = useAppStore((s) => s.applyTextureApply3dParamsModal);
  const close = useAppStore((s) => s.closeTextureApply3dParamsModal);
  const lastError = useAppStore((s) => s.lastError);

  const titleId = useId();
  const firstCat = TEXTURE_CATALOG_CATEGORIES[0]?.id ?? "wood";
  const [categoryId, setCategoryId] = useState(firstCat);
  const [textureId, setTextureId] = useState(() => textureCatalogEntriesForCategory(firstCat)[0]?.id ?? "");
  const [scalePercent, setScalePercent] = useState(100);
  const [mode, setMode] = useState<SurfaceTextureApplyMode>("object");
  const [resetTextures, setResetTextures] = useState(false);

  const { runApply, isSubmitting, applyError, clearApplyError } = useModalApplyClose(storeModalApplyNoop);

  const resetForm = useCallback(() => {
    const cat = TEXTURE_CATALOG_CATEGORIES[0]?.id ?? "wood";
    setCategoryId(cat);
    const first = textureCatalogEntriesForCategory(cat)[0];
    setTextureId(first?.id ?? "");
    setScalePercent(100);
    setMode("object");
    setResetTextures(false);
  }, []);

  useEffect(() => {
    if (modal) {
      resetForm();
      clearApplyError();
    }
  }, [modal, resetForm, clearApplyError]);

  useEffect(() => {
    if (!modal) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, close]);

  const entries = useMemo(() => textureCatalogEntriesForCategory(categoryId), [categoryId]);

  useEffect(() => {
    if (entries.length === 0) {
      return;
    }
    if (!entries.some((e) => e.id === textureId)) {
      setTextureId(entries[0]!.id);
    }
  }, [entries, textureId]);

  const selectedEntry = getTextureCatalogEntry(textureId);
  const previewUrl =
    selectedEntry != null
      ? getCatalogPreviewDataUrl(selectedEntry.id, selectedEntry.procedural.kind, selectedEntry.procedural.seed)
      : "";

  const threeTex = useMemo(() => {
    if (!selectedEntry) {
      return null;
    }
    return getCatalogDiffuseTexture(
      selectedEntry.id,
      selectedEntry.procedural.kind,
      selectedEntry.procedural.seed,
    );
  }, [selectedEntry]);

  if (!modal) {
    return null;
  }

  const submit = () =>
    runApply(() => {
      apply({
        mode,
        reset: resetTextures,
        textureId,
        scalePercent,
      });
      const s = useAppStore.getState();
      return finishStoreModalApply(s.textureApply3dParamsModal != null, s.lastError);
    });

  return (
    <div className="ta3d-backdrop" role="presentation" onClick={close}>
      <div
        className="ta3d-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && !e.shiftKey) {
            const el = e.target as HTMLElement | null;
            if (el?.tagName === "TEXTAREA") {
              return;
            }
            e.preventDefault();
            void submit();
          }
        }}
      >
        <div className="ta3d-head">
          <h2 id={titleId} className="ta3d-title">
            Параметры текстуры
          </h2>
          <button type="button" className="ta3d-close" aria-label="Закрыть" onClick={close}>
            ×
          </button>
        </div>
        <div className="ta3d-body">
          <nav className="ta3d-cats" aria-label="Категории текстур">
            <div className="ta3d-cats-label">Категории</div>
            {TEXTURE_CATALOG_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className="ta3d-cat-btn"
                data-active={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
              >
                {c.labelRu}
              </button>
            ))}
          </nav>
          <div className="ta3d-gallery-panel">
            <div className="ta3d-gallery-header">Текстуры категории</div>
            <div className="ta3d-gallery" role="listbox" aria-label="Галерея текстур">
              {entries.map((en) => (
                <button
                  key={en.id}
                  type="button"
                  role="option"
                  aria-selected={textureId === en.id}
                  className="ta3d-card"
                  data-active={textureId === en.id}
                  disabled={resetTextures}
                  onClick={() => setTextureId(en.id)}
                >
                  <img
                    className="ta3d-card-img"
                    src={getCatalogPreviewDataUrl(en.id, en.procedural.kind, en.procedural.seed)}
                    alt=""
                  />
                  <div className="ta3d-card-name">{en.name}</div>
                </button>
              ))}
            </div>
          </div>
          <aside className="ta3d-params" aria-label="Предпросмотр и параметры">
            <div className="ta3d-preview-section">
              <h3 className="ta3d-preview-section-title">Предпросмотр</h3>
              <div className="ta3d-preview-row">
                {previewUrl ? <img src={previewUrl} alt="" className="ta3d-preview-thumb" /> : null}
                <div className="ta3d-preview-meta">
                  <p className="ta3d-preview-name">{selectedEntry?.name ?? "—"}</p>
                  <p className="ta3d-preview-hint">
                    Масштаб влияет на повтор UV (тайлинг в метрах относительно каталожного размера плитки).
                  </p>
                </div>
                <div className="ta3d-cube-wrap" aria-hidden={!threeTex}>
                  {threeTex ? (
                    <Canvas style={{ width: "100%", height: "100%" }} camera={{ position: [1.85, 1.35, 1.85], fov: 42 }} gl={{ alpha: false }}>
                      <color attach="background" args={["#dce0e8"]} />
                      <ambientLight intensity={0.65} />
                      <directionalLight position={[4, 6, 3]} intensity={0.9} />
                      <TexturePreviewCube texture={threeTex} />
                      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={1.2} />
                    </Canvas>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="ta3d-controls">
              <div className="ta3d-field">
                <span className="ta3d-field-label">Масштаб (%)</span>
                <input
                  type="number"
                  min={5}
                  max={500}
                  step={5}
                  value={scalePercent}
                  disabled={resetTextures}
                  onChange={(e) => setScalePercent(Number(e.target.value))}
                  aria-label="Масштаб в процентах"
                />
              </div>
              <div className="ta3d-radio-group" role="radiogroup" aria-label="Применить к">
                <span className="ta3d-radio-group-title">Применить к</span>
                {(
                  [
                    ["object", "Объекту"],
                    ["layer", "Слою"],
                    ["project", "Проекту"],
                  ] as const
                ).map(([v, label]) => (
                  <label key={v} className="ta3d-radio-option">
                    <input type="radio" name="ta3d-mode" checked={mode === v} onChange={() => setMode(v)} />
                    {label}
                  </label>
                ))}
              </div>
              <label className="ta3d-check-row">
                <input type="checkbox" checked={resetTextures} onChange={(e) => setResetTextures(e.target.checked)} />
                Сброс текстур
              </label>
            </div>
          </aside>
        </div>
        {lastError || applyError ? <div className="ta3d-error">{applyError ?? lastError}</div> : null}
        <div className="ta3d-foot">
          <button type="button" className="ta3d-btn ta3d-btn--secondary" onClick={close} disabled={isSubmitting}>
            Отмена
          </button>
          <button type="button" className="ta3d-btn ta3d-btn--primary" disabled={isSubmitting} onClick={() => void submit()}>
            {isSubmitting ? "Применение…" : "Применить"}
          </button>
        </div>
      </div>
    </div>
  );
}
