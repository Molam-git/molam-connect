export type MolamTheme = {
  primary: string;
  onPrimary: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
};

export const baseTheme: MolamTheme = {
  primary: "var(--molam-primary)",
  onPrimary: "var(--molam-on-primary)",
  background: "var(--molam-bg)",
  surface: "var(--molam-surface)",
  text: "var(--molam-text)",
  muted: "var(--molam-muted)"
};

export function applyTheme(theme: Partial<MolamTheme>) {
  Object.entries(theme).forEach(([key, value]) => {
    if (value) document.documentElement.style.setProperty(`--molam-${key === "onPrimary" ? "on-primary" : key}`, value);
  });
}

