import { useCallback, useEffect, useState } from "react";
import { getJson } from "../lib/bridge.js";

/** Order book from GET /book, loaded at mount and refreshed every `intervalMs`. Offline the bridge serves the static ladder. */
export function useBook(intervalMs = 3000) {
  const [book, setBook] = useState({ status: "loading", data: null, error: null });

  const refresh = useCallback(async () => {
    const res = await getJson("/book");
    setBook(res.ok
      ? { status: "ok", data: res.data, error: null }
      : { status: "error", data: null, error: res.error });
  }, []);

  useEffect(() => {
    // The first load runs on a timer, not synchronously inside the effect.
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh, intervalMs]);

  return { ...book, refresh };
}
