import type { Dimension } from "./dimension";
import type { Foundation } from "./foundation";
import type { Layer } from "./layer";
import type { MaterialSet } from "./materialSet";
import type { Opening } from "./opening";
import type { ProjectMeta } from "./projectMeta";
import type { Room } from "./room";
import type { Roof } from "./roof";
import type { Sheet } from "./sheet";
import type { Profile } from "./profile";
import type { ProjectSettings } from "./settings";
import type { ViewState } from "./viewState";
import type { Point2D } from "../geometry/types";
import type { Wall } from "./wall";

export interface Project {
  readonly meta: ProjectMeta;
  /** Опорная точка плана в мировых координатах XY (мм); null — ещё не задана (первая стена задаёт точку). */
  readonly projectOrigin: Point2D | null;
  readonly layers: readonly Layer[];
  readonly activeLayerId: string;
  /** Дополнительные слои, показываемые в 2D поверх контекста; активный слой не включается. */
  readonly visibleLayerIds: readonly string[];
  readonly walls: readonly Wall[];
  readonly openings: readonly Opening[];
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
}
