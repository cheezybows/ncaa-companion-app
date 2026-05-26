export type ThemeId = 'dark-field-retro';

export const DEFAULT_THEME_ID: ThemeId = 'dark-field-retro';

/** Apply a theme token set via data-theme on the document root. */
export function applyTheme(themeId: ThemeId = DEFAULT_THEME_ID): void {
  document.documentElement.dataset.theme = themeId;
}

/** Initialize the default theme on app startup. */
export function initTheme(themeId: ThemeId = DEFAULT_THEME_ID): void {
  applyTheme(themeId);
}
