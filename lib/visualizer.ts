export const visualizerThemes = ["pulse", "bars", "orbit"] as const;
export type VisualizerTheme = typeof visualizerThemes[number];

export type VisualizerSettings = {
  id: "global";
  enabled: boolean;
  defaultTheme: VisualizerTheme;
  allowedThemes: VisualizerTheme[];
  updatedAt: Date | string | null;
  updatedBy: string | null;
};

export const defaultVisualizerSettings: VisualizerSettings = {
  id: "global",
  enabled: false,
  defaultTheme: "bars",
  allowedThemes: [...visualizerThemes],
  updatedAt: null,
  updatedBy: null,
};

export function normalizeVisualizerSettings(value?: Partial<VisualizerSettings> | null): VisualizerSettings {
  const allowedThemes = visualizerThemes.filter((theme) => value?.allowedThemes?.includes(theme));
  const safeAllowedThemes = allowedThemes.length ? allowedThemes : [...visualizerThemes];
  const defaultTheme = safeAllowedThemes.includes(value?.defaultTheme as VisualizerTheme)
    ? value?.defaultTheme as VisualizerTheme
    : safeAllowedThemes[0];

  return {
    ...defaultVisualizerSettings,
    ...value,
    enabled: Boolean(value?.enabled),
    defaultTheme,
    allowedThemes: safeAllowedThemes,
  };
}
