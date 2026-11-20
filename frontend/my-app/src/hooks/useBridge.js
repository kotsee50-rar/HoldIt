import { useCallback, useEffect, useReducer } from "react";
import { initialState, reduce } from "../lib/runState.js";
import { openEventStream, postJson } from "../lib/bridge.js";

/** Live state of the bridge, plus a function to start a sale. */
export function useBridge() {
  const [state, dispatch] = useReducer(reduce, undefined, initialState);

  useEffect(() => openEventStream({
    onOpen: () => dispatch({ type: "connection:open" }),
    onError: () => dispatch({ type: "connection:lost" }),
    onEvent: (event) => dispatch(event),
  }), []);

  const execute = useCallback(async (body) => {
    const res = await postJson("/execute", body);
    if (!res.ok) dispatch({ type: "local:error", message: res.error });
  }, []);

  return { state, execute };
}
