export interface Layer {
  readonly id: string;
  readonly name: string;
  readonly orderIndex: number;
  readonly elevationMm: number;
  readonly isVisible: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}
