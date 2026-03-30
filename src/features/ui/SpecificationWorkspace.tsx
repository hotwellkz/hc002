import { useMemo, useState } from "react";

import { buildCutListCandidates } from "@/core/domain/cutListCandidates";
import {
  buildOpeningFramingSpecificationRows,
  buildOpeningSpecificationRows,
  buildProjectLumberSummary,
  buildProjectWallSpecificationSummaries,
  buildWallSpecificationDetails,
  buildWallSpecificationSipPanels,
} from "@/core/domain/wallSpecification";
import { useAppStore } from "@/store/useAppStore";

import "./specification-workspace.css";

export function SpecificationWorkspace() {
  const project = useAppStore((s) => s.currentProject);
  const [openWallId, setOpenWallId] = useState<string | null>(null);

  const wallSummaries = useMemo(() => buildProjectWallSpecificationSummaries(project), [project]);
  const openingRows = useMemo(() => buildOpeningSpecificationRows(project), [project]);
  const openingFramingRows = useMemo(() => buildOpeningFramingSpecificationRows(project), [project]);
  const lumberSummary = useMemo(() => buildProjectLumberSummary(project), [project]);
  const cutCount = useMemo(() => buildCutListCandidates(project).length, [project]);

  return (
    <div className="spec-workspace">
      <header className="spec-workspace__header">
        <h2 className="spec-workspace__title">Спецификация и сводка</h2>
        <p className="spec-workspace__intro">
          Данные строятся из актуальных расчётов стен. После пересчёта списки обновляются автоматически. Кандидатов
          под раскрой: <strong>{cutCount}</strong>.
        </p>
      </header>

      <section className="spec-workspace__section" aria-labelledby="spec-walls-heading">
        <h3 id="spec-walls-heading" className="spec-workspace__h3">
          По стенам
        </h3>
        {wallSummaries.length === 0 ? (
          <p className="spec-workspace__empty">Нет стен с сохранённым расчётом. Выполните «Расчёт элементов стены» для
            выбранных стен.</p>
        ) : (
          <div className="spec-workspace__table-wrap">
            <table className="spec-workspace__table">
              <thead>
                <tr>
                  <th>Стена</th>
                  <th>Профиль</th>
                  <th>Длина, мм</th>
                  <th>Высота, мм</th>
                  <th>SIP-панелей</th>
                  <th>Досок</th>
                  <th>Проёмы</th>
                  <th>Узлы</th>
                </tr>
              </thead>
              <tbody>
                {wallSummaries.map((row) => (
                  <tr key={row.wallId}>
                    <td>
                      <button
                        type="button"
                        className="spec-workspace__wall-toggle"
                        onClick={() => setOpenWallId((id) => (id === row.wallId ? null : row.wallId))}
                        aria-expanded={openWallId === row.wallId}
                      >
                        {row.wallMark}
                      </button>
                    </td>
                    <td>{row.profileName}</td>
                    <td>{row.lengthMm}</td>
                    <td>{row.heightMm}</td>
                    <td>{row.sipPanelCount}</td>
                    <td>{row.lumberPieceCount}</td>
                    <td>{row.hasOpenings ? "да" : "—"}</td>
                    <td>{row.hasJoints ? "да" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {openWallId &&
          (() => {
            const wall = project.walls.find((w) => w.id === openWallId);
            if (!wall) {
              return null;
            }
            const details = buildWallSpecificationDetails(wall, project);
            const sipRows = buildWallSpecificationSipPanels(wall, project);
            return (
              <div className="spec-workspace__details">
                <h4 className="spec-workspace__h4">Детали: {wall.markLabel?.trim() ?? wall.id.slice(0, 8)}</h4>
                {sipRows.length === 0 && details.length === 0 ? (
                  <p className="spec-workspace__empty">Нет данных расчёта.</p>
                ) : (
                  <>
                    {sipRows.length > 0 && (
                      <div className="spec-workspace__subblock">
                        <h5 className="spec-workspace__h5">SIP-панели (марки в данных, не на 2D-плане)</h5>
                        <div className="spec-workspace__table-wrap">
                          <table className="spec-workspace__table spec-workspace__table--compact">
                            <thead>
                              <tr>
                                <th>Марка</th>
                                <th>Ширина, мм</th>
                                <th>Высота, мм</th>
                                <th>Толщина, мм</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sipRows.map((r) => (
                                <tr key={`sip-${r.sequenceIndex}-${r.pieceMark}`}>
                                  <td>{r.pieceMark}</td>
                                  <td>{r.widthMm}</td>
                                  <td>{r.heightMm}</td>
                                  <td>{r.thicknessMm}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {details.length > 0 && (
                      <div className="spec-workspace__subblock">
                        <h5 className="spec-workspace__h5">Каркас и обвязка</h5>
                        <div className="spec-workspace__table-wrap">
                          <table className="spec-workspace__table spec-workspace__table--compact">
                            <thead>
                              <tr>
                                <th>Марка</th>
                                <th>Тип</th>
                                <th>Сечение</th>
                                <th>Длина, мм</th>
                              </tr>
                            </thead>
                            <tbody>
                              {details.map((d) => (
                                <tr key={d.pieceMark}>
                                  <td>{d.pieceMark}</td>
                                  <td>{d.roleLabelRu}</td>
                                  <td>{d.sectionKey}</td>
                                  <td>{d.lengthMm}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}
      </section>

      <section className="spec-workspace__section" aria-labelledby="spec-openings-heading">
        <h3 id="spec-openings-heading" className="spec-workspace__h3">
          Окна и проёмы
        </h3>
        {openingRows.length === 0 ? (
          <p className="spec-workspace__empty">Нет окон, привязанных к стенам.</p>
        ) : (
          <div className="spec-workspace__table-wrap">
            <table className="spec-workspace__table spec-workspace__table--compact">
              <thead>
                <tr>
                  <th>Марка</th>
                  <th>Стена</th>
                  <th>Ширина × высота, мм</th>
                  <th>Форма</th>
                  <th>Пустой</th>
                </tr>
              </thead>
              <tbody>
                {openingRows.map((r) => (
                  <tr key={r.openingId}>
                    <td>{r.openingMark}</td>
                    <td>{r.wallMark}</td>
                    <td>
                      {r.widthMm} × {r.heightMm}
                    </td>
                    <td>{r.formName}</td>
                    <td>{r.isEmptyOpening ? "да" : "нет"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="spec-workspace__section" aria-labelledby="spec-opening-framing-heading">
        <h3 id="spec-opening-framing-heading" className="spec-workspace__h3">
          Конструктив обрамления проёмов
        </h3>
        {openingFramingRows.length === 0 ? (
          <p className="spec-workspace__empty">Нет сгенерированных элементов обрамления (после настройки окна и SIP).</p>
        ) : (
          <div className="spec-workspace__table-wrap">
            <table className="spec-workspace__table spec-workspace__table--compact">
              <thead>
                <tr>
                  <th>Марка детали</th>
                  <th>Окно</th>
                  <th>Стена</th>
                  <th>Тип</th>
                  <th>Профиль</th>
                  <th>Длина, мм</th>
                </tr>
              </thead>
              <tbody>
                {openingFramingRows.map((r) => (
                  <tr key={r.pieceId}>
                    <td>{r.pieceMark}</td>
                    <td>{r.openingMark}</td>
                    <td>{r.wallMark}</td>
                    <td>{r.kindLabelRu}</td>
                    <td>{r.profileName}</td>
                    <td>{r.lengthMm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="spec-workspace__section" aria-labelledby="spec-lumber-heading">
        <h3 id="spec-lumber-heading" className="spec-workspace__h3">
          Сводка пиломатериалов по проекту
        </h3>
        {lumberSummary.length === 0 ? (
          <p className="spec-workspace__empty">Нет пиломатериалов в расчётах.</p>
        ) : (
          <div className="spec-workspace__table-wrap">
            <table className="spec-workspace__table">
              <thead>
                <tr>
                  <th>Сечение</th>
                  <th>Длина, мм</th>
                  <th>Кол-во</th>
                  <th>Суммарная длина, мм</th>
                  <th>Стены</th>
                </tr>
              </thead>
              <tbody>
                {lumberSummary.map((row) => (
                  <tr key={`${row.sectionKey}-${row.lengthMm}`}>
                    <td>{row.sectionKey}</td>
                    <td>{row.lengthMm}</td>
                    <td>{row.count}</td>
                    <td>{row.totalLengthMm}</td>
                    <td className="spec-workspace__marks-cell">
                      {row.wallMarks.length <= 4 ? row.wallMarks.join(", ") : `${row.wallMarks.length} стен`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="spec-workspace__section" aria-labelledby="spec-cut-heading">
        <h3 id="spec-cut-heading" className="spec-workspace__h3">
          База под раскрой
        </h3>
        <p className="spec-workspace__hint">
          Внутренний формат <code>CutListCandidate</code> (pieceId, wallId, сечение, длина, роль) формируется функцией{" "}
          <code>buildCutListCandidates</code> — без дублирования в проекте; источник — только расчётные детали.
        </p>
      </section>
    </div>
  );
}
