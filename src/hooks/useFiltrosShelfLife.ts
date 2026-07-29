import { useCallback, useEffect, useState } from "react";

/** Estado persistido por usuário no navegador (localStorage). */
export function usePersistedState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setState(JSON.parse(raw) as T);
    } catch {
      /* ignora storage indisponível */
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignora */
    }
  }, [key, state, hydrated]);

  const reset = useCallback(() => setState(initial), [initial]);
  return [state, setState, reset, hydrated] as const;
}

export const SHELF_CONFIG_KEY = "shelf-life:config";

export type ShelfConfig = {
  /** Almoxarifados ativos: vazio = todos os permitidos ao usuário. */
  almoxAtivos: string[];
  /** Considerar apenas lotes com saldo > 0. */
  somenteComSaldo: boolean;
};

const DEFAULT_CONFIG: ShelfConfig = { almoxAtivos: [], somenteComSaldo: true };

/** Configuração compartilhada pelas telas do pilar Shelf Life. */
export function useShelfConfig() {
  const [config, setConfig, reset, hydrated] = usePersistedState<ShelfConfig>(SHELF_CONFIG_KEY, DEFAULT_CONFIG);
  const setAlmoxAtivos = useCallback(
    (almoxAtivos: string[]) => setConfig((c) => ({ ...c, almoxAtivos })),
    [setConfig],
  );
  const setSomenteComSaldo = useCallback(
    (somenteComSaldo: boolean) => setConfig((c) => ({ ...c, somenteComSaldo })),
    [setConfig],
  );
  return {
    almoxAtivos: config.almoxAtivos ?? [],
    somenteComSaldo: config.somenteComSaldo !== false,
    setAlmoxAtivos,
    setSomenteComSaldo,
    resetConfig: reset,
    hydrated,
  };
}

/**
 * Interseção entre os almoxarifados permitidos ao usuário (null = irrestrito)
 * e os almoxarifados ativos escolhidos na configuração.
 * Retorna null quando não há restrição alguma.
 */
export function almoxEfetivos(permitidos: string[] | null, ativos: string[]): string[] | null {
  if (!ativos.length) return permitidos;
  if (!permitidos) return ativos;
  return ativos.filter((a) => permitidos.includes(a));
}
