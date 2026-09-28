export type ThemeId = "professional" | "blue" | "black";

export const THEME_KEY = "nga-theme";

export type ThemeTokens = {
  label: string;
  pageBg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  sidebarBg: string;
  sidebarText: string;
  accent: string;
  accentText: string;
  headerFrom: string;
};

export const THEMES: Record<ThemeId, ThemeTokens> = {
  professional: {
    label: "Professional (default)",
    pageBg: "#f8fafc",
    surface: "#ffffff",
    surfaceAlt: "#f8fafc",
    border: "#e2e8f0",
    text: "#0f172a",
    textMuted: "#64748b",
    sidebarBg: "#0f172a",
    sidebarText: "#cbd5e1",
    accent: "#0f172a",
    accentText: "#ffffff",
    headerFrom: "#f0f9ff",
  },
  blue: {
    label: "Blue",
    pageBg: "#eff6ff",
    surface: "#ffffff",
    surfaceAlt: "#eff6ff",
    border: "#bfdbfe",
    text: "#0f172a",
    textMuted: "#475569",
    sidebarBg: "#1e3a8a",
    sidebarText: "#bfdbfe",
    accent: "#2563eb",
    accentText: "#ffffff",
    headerFrom: "#dbeafe",
  },
  black: {
    label: "Black / Dark",
    pageBg: "#0b1220",
    surface: "#111827",
    surfaceAlt: "#1e293b",
    border: "#334155",
    text: "#e5e7eb",
    textMuted: "#94a3b8",
    sidebarBg: "#000000",
    sidebarText: "#94a3b8",
    accent: "#38bdf8",
    accentText: "#0b1220",
    headerFrom: "#1e293b",
  },
};

export function isThemeId(value: string | null): value is ThemeId {
  return value === "professional" || value === "blue" || value === "black";
}
