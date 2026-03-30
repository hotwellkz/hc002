export type OpeningAlongAnchor = "wall_start" | "wall_end" | "wall_center";
export type OpeningAlongAlignment = "center" | "leading" | "trailing";

export interface OpeningPositionSpec {
  readonly anchorAlongWall: OpeningAlongAnchor;
  readonly offsetAlongWallMm: number;
  readonly alignment: OpeningAlongAlignment;
  /** Высота низа проёма от базы стены (слой + baseElevation), мм. */
  readonly sillLevelMm: number;
}

export interface OpeningSipConstructionSpec {
  readonly aboveProfileId: string | null;
  readonly aboveDouble: boolean;
  readonly lintelTopProfileId: string | null;
  /** Две доски перемычки сверху (например параллельный пакет). */
  readonly lintelTopDouble?: boolean;
  readonly lintelBottomProfileId: string | null;
  readonly lintelBottomDouble?: boolean;
  readonly sideProfileId: string | null;
  readonly sideType: "type1" | "type2" | "type3";
  readonly sideClosingStuds: boolean;
  readonly belowProfileId: string | null;
  readonly belowDouble: boolean;
}
