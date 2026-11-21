// Pure state machine for the bridge's event stream (see agent/README.md, "Bridge").
// No React here: it is tested with node:test (npm test).
import { formatTokens } from "./format.js";
//
// Routing rules, from the bridge contract:
// - run:start / run:end carry kind "execute" for every sale (live and replay) and "reset"
//   for ladder resets. Reset runs are not shown.
// - every engine event carries `mode` ("naive" or "guarded"). Route by mode, never by the
//   panel that started the run.

const MAX_LOG = 200;

export function initialState() {
  return {
    connected: false,
    online: null, // null until the first hello tells us
    busy: false,
    run: null, // { id, mode, replay } of the run in progress
    error: null, // last error to show to the user
    naive: { status: "idle", result: null, progressPct: 0 },
    guarded: { status: "idle", result: null, progressPct: 0, slippagePct: 0, log: [] },
  };
}

const line = (log, text) => [text, ...log].slice(0, MAX_LOG);
const replayLabel = (replay) => (replay ? ` (replay ${replay})` : "");

export function reduce(state, event) {
  switch (event.type) {
    case "connection:open":
      return { ...state, connected: true };

    case "connection:lost":
      return { ...state, connected: false };

    case "local:error":
      return { ...state, error: event.message };

    case "hello":
      return {
        ...state,
        connected: true,
        online: event.online,
        busy: event.busy,
        run: event.run && event.run.kind === "execute"
          ? { id: event.run.id, mode: event.run.params?.mode, replay: event.run.params?.replay ?? null }
          : null,
        error: null,
      };

    case "run:start":
      return startRun(state, event);

    case "run:end":
      return endRun(state, event);

    case "seeding":
      if (event.mode === "naive") return { ...state, naive: { ...state.naive, status: "preparing" } };
      if (event.mode === "guarded") {
        return { ...state, guarded: { ...state.guarded, log: line(state.guarded.log, "[SYSTEM] Preparing market...") } };
      }
      return state;

    default:
      return engineEvent(state, event);
  }
}

function startRun(state, event) {
  if (event.kind !== "execute") return state;
  const mode = event.params?.mode;
  const run = { id: event.runId, mode, replay: event.params?.replay ?? null };
  const base = { ...state, busy: true, run, error: null };
  if (mode === "naive") {
    return { ...base, naive: { status: "running", result: null, progressPct: 0 } };
  }
  if (mode === "guarded") {
    return {
      ...base,
      guarded: {
        status: "running",
        result: null,
        progressPct: 0,
        slippagePct: 0,
        log: [`[SYSTEM] Starting guarded${replayLabel(run.replay)} (ID: ${String(event.runId).slice(0, 8)})`],
      },
    };
  }
  return base;
}

function endRun(state, event) {
  if (event.kind !== "execute") return state;
  const mode = state.run?.mode;
  const base = { ...state, busy: false, run: null };

  if (!event.ok) {
    return {
      ...base,
      error: event.error ?? "Run failed",
      naive: mode === "naive" ? { ...state.naive, status: "failed" } : state.naive,
      guarded: mode === "guarded"
        ? { ...state.guarded, status: "failed", log: line(state.guarded.log, `[SYSTEM] FAILED: ${event.error}`) }
        : state.guarded,
    };
  }

  if (mode === "naive") {
    return {
      ...base,
      naive: { status: event.result.status, result: event.result, progressPct: 100 },
    };
  }
  if (mode === "guarded") {
    return {
      ...base,
      guarded: {
        ...state.guarded,
        status: event.result.status,
        result: event.result,
        log: line(state.guarded.log, `[SYSTEM] Run finished: ${event.result.status}`),
      },
    };
  }
  return base;
}

// Engine events: start, waiting, killed, chunk, halt, done. Ignored when they carry no mode.
function engineEvent(state, event) {
  if (event.mode === "naive") return naiveEvent(state, event);
  if (event.mode === "guarded") return guardedEvent(state, event);
  return state;
}

function naiveEvent(state, event) {
  if (event.type === "chunk") {
    return { ...state, naive: { ...state.naive, progressPct: event.progressPct } };
  }
  return state;
}

function guardedEvent(state, event) {
  const g = state.guarded;
  switch (event.type) {
    case "start":
      return {
        ...state,
        guarded: {
          ...g,
          log: line(g.log, `[START] ${event.totalAmount} token, mandate ${event.maxSlippagePercent}%, floor ${event.minPrice.toFixed(8)} XRP`),
        },
      };
    case "waiting":
      return { ...state, guarded: { ...g, log: line(g.log, "[WAIT] Waiting for in-band liquidity...") } };
    case "killed":
      return { ...state, guarded: { ...g, log: line(g.log, `[KILLED] Chunk ${event.index}: no fill, retrying`) } };
    case "chunk":
      return {
        ...state,
        guarded: {
          ...g,
          slippagePct: event.slippagePct,
          progressPct: event.progressPct,
          log: line(
            g.log,
            `[CHUNK ${event.index}] Sold ${formatTokens(event.sold)} @ avg ${event.avgPrice.toFixed(8)} | Slippage: ${event.slippagePct.toFixed(3)}%`,
          ),
        },
      };
    case "halt":
      return { ...state, guarded: { ...g, log: line(g.log, `[HALT] ${event.reason}`) } };
    default:
      return state;
  }
}
