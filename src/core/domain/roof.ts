export interface RoofSlope {
  readonly id: string;
  readonly azimuthDeg?: number;
  readonly pitchDeg?: number;
}

export interface Roof {
  readonly slopes: readonly RoofSlope[];
  readonly notes?: string;
}
