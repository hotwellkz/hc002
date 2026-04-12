import type { Dimension } from "./dimension";
import type { Foundation } from "./foundation";
import type { FoundationPileEntity } from "./foundationPile";
import type { FoundationStripEntity } from "./foundationStrip";
import type { Layer } from "./layer";
import type { MaterialSet } from "./materialSet";
import type { Opening } from "./opening";
import type { OpeningFramingPiece } from "./openingFramingPiece";
import type { ProjectMeta } from "./projectMeta";
import type { Room } from "./room";
import type { Roof } from "./roof";
import type { RoofPlaneEntity } from "./roofPlane";
import type { Sheet } from "./sheet";
import type { SlabEntity } from "./slab";
import type { SurfaceTextureState } from "./surfaceTextureState";
import type { Profile } from "./profile";
import type { ProjectSettings } from "./settings";
import type { ViewState } from "./viewState";
import type { Point2D } from "../geometry/types";
import type { PlanLine } from "./planLine";
import type { Wall } from "./wall";
import type { WallCalculationResult } from "./wallCalculation";
import type { WallJoint } from "./wallJoint";
import type { FloorBeamEntity } from "./floorBeam";

export interface Project {
  readonly meta: ProjectMeta;
  /** Опорная точка плана в мировых координатах XY (мм); null — ещё не задана (первая стена задаёт точку). */
  readonly projectOrigin: Point2D | null;
  readonly layers: readonly Layer[];
  readonly activeLayerId: string;
  /** Дополнительные слои, показываемые в 2D поверх контекста; активный слой не включается. */
  readonly visibleLayerIds: readonly string[];
  readonly walls: readonly Wall[];
  /** Вспомогательные линии чертежа (2D), не влияют на 3D и расчёты. */
  readonly planLines: readonly PlanLine[];
  /** Ленточный фундамент на плане (по слоям). */
  readonly foundationStrips: readonly FoundationStripEntity[];
  /** Сваи фундамента на плане (по слоям). */
  readonly foundationPiles: readonly FoundationPileEntity[];
  /** Плиты (контур в плане, уровень и толщина по Z). */
  readonly slabs: readonly SlabEntity[];
  /** Балки/доски перекрытия (линейные элементы по профилю). */
  readonly floorBeams: readonly FloorBeamEntity[];
  /** Плоскости скатов крыши на плане (режим «Крыша»). */
  readonly roofPlanes: readonly RoofPlaneEntity[];
  /** Результаты производственного расчёта по стенам (SIP-раскладка, пиломатериалы). */
  readonly wallCalculations: readonly WallCalculationResult[];
  /** Узлы соединения стен (углы, примыкания); персистится в snapshot. */
  readonly wallJoints: readonly WallJoint[];
  readonly openings: readonly Opening[];
  /** Конструктив обрамления проёмов (окна); при наличии — авто-обрамление расчёта для этого openingId отключается. */
  readonly openingFramingPieces: readonly OpeningFramingPiece[];
  readonly rooms: readonly Room[];
  readonly foundation: Foundation;
  readonly roof: Roof;
  readonly materialSet: MaterialSet;
  readonly sheets: readonly Sheet[];
  readonly dimensions: readonly Dimension[];
  readonly settings: ProjectSettings;
  readonly viewState: ViewState;
  /** Библиотека профилей сечений (часть проекта, сохраняется в snapshot). */
  readonly profiles: readonly Profile[];
  /** Переопределения текстур 3D: объект → слой → проект → цвет по умолчанию. */
  readonly surfaceTextureState: SurfaceTextureState;
}
