/** Пресеты промпта для будущего AI enhancement (MVP: только текст). */
export type ImageEnhancementPromptPresetId = "clean_minimal" | "client_presentation" | "premium_exterior";

export const IMAGE_ENHANCEMENT_PROMPT_PRESETS: Readonly<
  Record<ImageEnhancementPromptPresetId, { readonly id: ImageEnhancementPromptPresetId; readonly labelRu: string; readonly prompt: string }>
> = {
  clean_minimal: {
    id: "clean_minimal",
    labelRu: "Чистый минимализм",
    prompt:
      "Use the provided 3D architectural render as the exact geometric base. Preserve the house shape, roof silhouette, wall proportions, window and door positions exactly. Do not redesign the building. Only enhance the presentation: subtle materials, soft daylight, clean sky, minimal landscaping. Photorealistic, calm, premium. Do not add people, cars, or extra buildings. Do not distort perspective.",
  },
  client_presentation: {
    id: "client_presentation",
    labelRu: "Презентация клиенту",
    prompt:
      "Use the provided 3D architectural render as the exact geometric base. Preserve exact building geometry, roof shape, openings and proportions. Do not add floors or move doors/windows. Enhance: realistic exterior finishing, gentle landscaping, paving, grass, a few trees, natural daylight, soft shadows, believable sky. Modern, photorealistic, not overdecorated. Suitable for an architectural cover page.",
  },
  premium_exterior: {
    id: "premium_exterior",
    labelRu: "Премиум фасад",
    prompt:
      "Use the provided 3D architectural render as the exact geometric base. Strictly preserve structure: no extra floors, no redesign of roof or openings. Only improve presentation layer: premium facade materials, roof detail, refined landscaping, warm daylight, soft shadows, clean environment. Photorealistic, high-end, restrained. No people or vehicles unless requested.",
  },
};
