import { useCallback, useEffect, useState } from 'preact/hooks';
import { loadAllPacks } from '../data/packStorage.ts';
import { EMPTY_RULES, mergePacks, type Rules } from '../data/rules.ts';

// Packs are a couple of megabytes of JSON; parse them once per session and share the result.
let cache: Promise<Rules> | null = null;

export function loadRules(force = false): Promise<Rules> {
  if (!cache || force) cache = loadAllPacks().then(mergePacks);
  return cache;
}

export function invalidateRules(): void {
  cache = null;
}

export interface RulesHandle {
  status: 'loading' | 'ready';
  rules: Rules;
  refresh: () => void;
}

export function useRules(): RulesHandle {
  const [state, setState] = useState<{ status: 'loading' | 'ready'; rules: Rules }>({
    status: 'loading',
    rules: EMPTY_RULES,
  });
  const load = useCallback((force: boolean) => {
    let alive = true;
    void loadRules(force).then((rules) => {
      if (alive) setState({ status: 'ready', rules });
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => load(false), [load]);
  const refresh = useCallback(() => {
    invalidateRules();
    load(true);
  }, [load]);
  return { ...state, refresh };
}
