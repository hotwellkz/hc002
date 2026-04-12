import type { Project } from "@/core/domain/project";

import type { Editor3dPickPayload } from "./editor3dPick";
import { ProjectCalculationMeshes } from "./ProjectCalculationMeshes";
import { ProjectFoundationPiles } from "./ProjectFoundationPiles";
import { ProjectFoundationStrips } from "./ProjectFoundationStrips";
import { ProjectFloorBeams } from "./ProjectFloorBeams";
import { ProjectFloorInsulation } from "./ProjectFloorInsulation";
import { ProjectOpeningMeshes } from "./ProjectOpeningMeshes";
import { ProjectSipSeamLines } from "./ProjectSipSeamLines";
import { ProjectSlabs } from "./ProjectSlabs";
import { ProjectWalls } from "./ProjectWalls";
import { ProjectRoofAssembly } from "./ProjectRoofAssembly";
import { ProjectRoofFramingWood } from "./ProjectRoofFramingWood";
import { ProjectRoofRafters } from "./ProjectRoofRafters";

export type CalcFocus3d = { readonly wallId: string; readonly reactKey: string };

/**
 * Полная 3D-модель проекта (стены, крыша, фундамент и т.д.) без сетки и UI.
 * Используется в редакторе и в изолированном рендере обложки отчёта.
 */
export function Editor3dProjectSceneContent({
  project,
  selectedWallEntityId,
  selectedFloorBeamEntityId,
  selectedOpeningEntityId,
  selectedPileEntityId,
  selectedStripEntityId,
  selectedSlabEntityId,
  calcFocus,
  hoverWallEntityId,
  hoverFloorBeamEntityId,
  hoverOpeningEntityId,
  hoverPileEntityId,
  hoverStripEntityId,
  hoverSlabEntityId,
  hoverRoofBattenEntityId,
  hoverRoofPlaneEntityId,
  hoverRoofRafterEntityId,
  hoverCalcReactKey,
  texturePickHover,
  texturePickLocked,
  selectedRoofBattenEntityId,
  selectedRoofPlaneEntityId,
  selectedRoofRafterEntityId,
  selectedFloorInsulationEntityId,
  hoverFloorInsulationEntityId,
}: {
  readonly project: Project;
  readonly selectedWallEntityId: string | null;
  readonly selectedFloorBeamEntityId: string | null;
  readonly selectedOpeningEntityId: string | null;
  readonly selectedPileEntityId: string | null;
  readonly selectedStripEntityId: string | null;
  readonly selectedSlabEntityId: string | null;
  readonly selectedRoofBattenEntityId: string | null;
  readonly selectedRoofPlaneEntityId: string | null;
  readonly selectedRoofRafterEntityId: string | null;
  readonly selectedFloorInsulationEntityId: string | null;
  readonly hoverFloorInsulationEntityId: string | null;
  readonly calcFocus: CalcFocus3d | null;
  readonly hoverWallEntityId: string | null;
  readonly hoverFloorBeamEntityId: string | null;
  readonly hoverOpeningEntityId: string | null;
  readonly hoverPileEntityId: string | null;
  readonly hoverStripEntityId: string | null;
  readonly hoverSlabEntityId: string | null;
  readonly hoverRoofBattenEntityId: string | null;
  readonly hoverRoofPlaneEntityId: string | null;
  readonly hoverRoofRafterEntityId: string | null;
  readonly hoverCalcReactKey: string | null;
  readonly texturePickHover: Editor3dPickPayload | null;
  readonly texturePickLocked: Editor3dPickPayload | null;
}) {
  const showCalc = project.viewState.show3dCalculation !== false;
  const vs = project.viewState;
  const showSipSeamLines = showCalc && (vs.show3dLayerEps !== false || vs.show3dLayerOsb !== false);
  return (
    <>
      <ProjectFoundationStrips
        project={project}
        selectedStripEntityId={selectedStripEntityId}
        hoverStripEntityId={hoverStripEntityId}
        texturePickHover={texturePickHover}
        texturePickLocked={texturePickLocked}
      />
      <ProjectWalls
        project={project}
        selectedWallEntityId={selectedWallEntityId}
        calcFocus={calcFocus}
        hoverWallEntityId={hoverWallEntityId}
        texturePickHover={texturePickHover}
        texturePickLocked={texturePickLocked}
      />
      <ProjectFloorBeams
        project={project}
        selectedBeamEntityId={selectedFloorBeamEntityId}
        hoverBeamEntityId={hoverFloorBeamEntityId}
      />
      <ProjectFloorInsulation
        project={project}
        selectedPieceId={selectedFloorInsulationEntityId}
        hoverPieceId={hoverFloorInsulationEntityId}
      />
      <ProjectFoundationPiles
        project={project}
        selectedPileEntityId={selectedPileEntityId}
        hoverPileEntityId={hoverPileEntityId}
        texturePickHover={texturePickHover}
        texturePickLocked={texturePickLocked}
      />
      <ProjectSlabs
        project={project}
        selectedSlabEntityId={selectedSlabEntityId}
        hoverSlabEntityId={hoverSlabEntityId}
        texturePickHover={texturePickHover}
        texturePickLocked={texturePickLocked}
      />
      <ProjectCalculationMeshes
        project={project}
        visible={showCalc}
        calcFocus={calcFocus}
        hoverCalcReactKey={hoverCalcReactKey}
        texturePickHover={texturePickHover}
        texturePickLocked={texturePickLocked}
      />
      <ProjectSipSeamLines project={project} visible={showSipSeamLines} />
      <ProjectOpeningMeshes
        project={project}
        selectedOpeningEntityId={selectedOpeningEntityId}
        hoverOpeningEntityId={hoverOpeningEntityId}
        texturePickHover={texturePickHover}
        texturePickLocked={texturePickLocked}
      />
      <ProjectRoofAssembly
        project={project}
        selectedRoofBattenEntityId={selectedRoofBattenEntityId}
        hoverRoofBattenEntityId={hoverRoofBattenEntityId}
        selectedRoofPlaneEntityId={selectedRoofPlaneEntityId}
        hoverRoofPlaneEntityId={hoverRoofPlaneEntityId}
      />
      <ProjectRoofRafters
        project={project}
        selectedRafterEntityId={selectedRoofRafterEntityId}
        hoverRafterEntityId={hoverRoofRafterEntityId}
      />
      <ProjectRoofFramingWood project={project} />
    </>
  );
}

/** Для сцены обложки: без выделений и наведений. */
export function ReportCoverProjectSceneContent({ project }: { readonly project: Project }) {
  return (
    <Editor3dProjectSceneContent
      project={project}
      selectedWallEntityId={null}
      selectedFloorBeamEntityId={null}
      selectedOpeningEntityId={null}
      selectedPileEntityId={null}
      selectedStripEntityId={null}
      selectedSlabEntityId={null}
      selectedRoofBattenEntityId={null}
      selectedRoofPlaneEntityId={null}
      selectedRoofRafterEntityId={null}
      selectedFloorInsulationEntityId={null}
      hoverFloorInsulationEntityId={null}
      hoverRoofRafterEntityId={null}
      calcFocus={null}
      hoverWallEntityId={null}
      hoverFloorBeamEntityId={null}
      hoverOpeningEntityId={null}
      hoverPileEntityId={null}
      hoverStripEntityId={null}
      hoverSlabEntityId={null}
      hoverRoofBattenEntityId={null}
      hoverRoofPlaneEntityId={null}
      hoverCalcReactKey={null}
      texturePickHover={null}
      texturePickLocked={null}
    />
  );
}
