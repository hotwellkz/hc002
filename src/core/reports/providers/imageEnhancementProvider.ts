import type { ImageEnhancementPromptPresetId } from "./imageEnhancementPresets";
import { IMAGE_ENHANCEMENT_PROMPT_PRESETS } from "./imageEnhancementPresets";

/** Включение реального AI — позже; сейчас всегда false. */
export const FEATURE_AI_COVER_ENHANCEMENT = false;

export type CoverRenderMode = "sourceRenderOnly" | "aiEnhanced" | "both";

export interface ImageEnhancementOptions {
  readonly mode: CoverRenderMode;
  /** MIME, например image/png */
  readonly mimeTypeHint?: string;
}

export interface ImageEnhancementResult {
  readonly imageBytes: Uint8Array;
  readonly mimeType: string;
  readonly providerId: string;
}

/**
 * Абстракция провайдера постобработки изображений (Nano Banana и др.).
 * MVP: заглушка; при FEATURE_AI_COVER_ENHANCEMENT === false — только stub.
 */
export interface ImageEnhancementProvider {
  readonly providerId: string;
  enhance(
    image: Blob | Uint8Array,
    promptPreset: ImageEnhancementPromptPresetId,
    options: ImageEnhancementOptions,
  ): Promise<ImageEnhancementResult>;
}

export class StubImageEnhancementProvider implements ImageEnhancementProvider {
  readonly providerId = "stub";

  async enhance(
    _image: Blob | Uint8Array,
    preset: ImageEnhancementPromptPresetId,
    _options: ImageEnhancementOptions,
  ): Promise<ImageEnhancementResult> {
    const meta = IMAGE_ENHANCEMENT_PROMPT_PRESETS[preset];
    const msg = FEATURE_AI_COVER_ENHANCEMENT
      ? "AI enhancement not wired"
      : `AI-улучшение обложки скоро (${meta.labelRu}).`;
    const bytes = new TextEncoder().encode(msg);
    return { imageBytes: bytes, mimeType: "text/plain", providerId: this.providerId };
  }
}

let defaultProvider: ImageEnhancementProvider = new StubImageEnhancementProvider();

export function getDefaultImageEnhancementProvider(): ImageEnhancementProvider {
  return defaultProvider;
}

/** Для тестов или будущей подмены реализации. */
export function setDefaultImageEnhancementProvider(p: ImageEnhancementProvider): void {
  defaultProvider = p;
}
