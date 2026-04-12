export const COVER_BG_HEX = {
  white: "#ffffff",
  light_gray: "#eceff4",
  sky_light: "#e6edf5",
} as const;

export type CoverBackgroundKey = keyof typeof COVER_BG_HEX;
