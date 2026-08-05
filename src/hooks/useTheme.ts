import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ThemeId = "atual" | "magio-claro" | "magio-escuro";

export const THEMES: { id: ThemeId; nome: string; descricao: string; dark: boolean; swatches: string[] }[] = [
  {
    id: "atual",
    nome: "Amazônia Premium (Atual)",
    descricao: "Identidade atual — Verde Floresta, Dourado Cacau e Bege Natural.",
    dark: false,
    swatches: ["#1B5E20", "#2E7D32", "#C9A227", "#5D4037", "#F5F1E6"],
  },
  {
    id: "magio-claro",
    nome: "Mágio Claro",
    descricao: "Design System oficial — Verde Amazônia, Azul Institucional e Off White.",
    dark: false,
    swatches: ["#4E7F84", "#34436C", "#B1BFE2", "#E4E0D5", "#FFFFFF"],
  },
  {
    id: "magio-escuro",
    nome: "Mágio Escuro",
    descricao: "Derivação escura do Design System, mantendo a identidade institucional.",
    dark: true,
    swatches: ["#6FA3A8", "#8FA3D6", "#3A4A66", "#232E3D", "#1B2430"],
  },
];

const STORAGE_KEY = "magio.theme";
const LEGACY_KEY = "inv-theme";

export function isThemeId(v: unknown): v is ThemeId {
  return v === "atual" || v === "magio-claro" || v === "magio-escuro";
}

export function readStoredTheme(): ThemeId {
  if (typeof window === "undefined") return "atual";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isThemeId(stored)) return stored;
  return "atual";
}

/** Aplica o tema no elemento raiz — data-theme + classe .dark para as variantes escuras. */
export function applyTheme(theme: ThemeId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  const isDark = THEMES.find((t) => t.id === theme)?.dark ?? false;
  root.classList.toggle("dark", isDark);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* storage indisponível */
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>("atual");
  const [hydrated, setHydrated] = useState(false);

  // Hidrata do localStorage e, em seguida, da preferência salva do usuário.
  useEffect(() => {
    const local = readStoredTheme();
    setThemeState(local);
    applyTheme(local);
    setHydrated(true);
    let cancelled = false;
    (async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid || cancelled) return;
      const { data } = await (supabase as never as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { tema_selecionado?: string } | null }> };
          };
        };
      })
        .from("preferencias_usuario")
        .select("tema_selecionado")
        .eq("usuario_id", uid)
        .maybeSingle();
      const remoto = data?.tema_selecionado;
      if (!cancelled && isThemeId(remoto) && remoto !== local) {
        setThemeState(remoto);
        applyTheme(remoto);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    applyTheme(next);
    void (async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) return;
      await (supabase as never as {
        from: (t: string) => { upsert: (v: unknown, o?: unknown) => Promise<unknown> };
      })
        .from("preferencias_usuario")
        .upsert(
          { usuario_id: uid, tema_selecionado: next, atualizado_em: new Date().toISOString() },
          { onConflict: "usuario_id" },
        );
    })();
  }, []);

  /** Atalho claro/escuro do tema Mágio (o tema "Atual" cai no Mágio Escuro). */
  const toggle = useCallback(() => {
    setTheme(theme === "magio-escuro" ? "magio-claro" : "magio-escuro");
  }, [theme, setTheme]);

  const isDark = THEMES.find((t) => t.id === theme)?.dark ?? false;

  return { theme, setTheme, toggle, isDark, hydrated };
}
