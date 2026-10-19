import { useCallback, useEffect, useState, type DependencyList } from "react";

interface AsyncState<T> {
  data?: T;
  error?: unknown;
  loading: boolean;
}

/** Runs `fn` when `deps` change; `reload()` runs it again. Stale results are dropped. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<AsyncState<T>>({ loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let current = true;
    setState((s) => ({ data: s.data, loading: true }));
    fn().then(
      (data) => current && setState({ data, loading: false }),
      (error: unknown) => current && setState({ error, loading: false }),
    );
    return () => {
      current = false;
    };
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((data: T) => setState({ data, loading: false }), []);
  return { ...state, reload, setData };
}
