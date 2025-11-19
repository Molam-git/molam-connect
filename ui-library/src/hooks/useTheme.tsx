import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

export function useTheme(defaultTheme: Theme = "light"){
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem("molam_theme");
      return (stored as Theme) || defaultTheme;
    } catch { return defaultTheme; }
  });

  useEffect(()=>{
    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    try{ localStorage.setItem("molam_theme", theme); } catch {}
  }, [theme]);

  return { theme, setTheme };
}

