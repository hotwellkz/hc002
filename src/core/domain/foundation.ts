export type FoundationType = "none" | "strip" | "slab" | "other";

export interface Foundation {
  readonly type: FoundationType;
  readonly notes?: string;
}
