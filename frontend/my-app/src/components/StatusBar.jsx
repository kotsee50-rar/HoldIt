import { BRIDGE_URL } from "../lib/bridge.js";

function describe(state) {
  if (!state.connected) return { text: "Bridge not connected", dot: "bg-pale" };
  if (state.online === false) return { text: "Bridge offline: replay only", dot: "bg-pale" };
  if (state.busy) return { text: "Run in progress", dot: "bg-frost" };
  return { text: "Ready", dot: "bg-frost" };
}

export function StatusBar({ state }) {
  const { text, dot } = describe(state);
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-silver bg-silver/30 px-4 py-3 text-sm">
      <span className="flex items-center gap-2 font-semibold text-shadow">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden="true" />
        {text}
      </span>
      <span className="font-mono text-xs text-shadow/60">{BRIDGE_URL}</span>
    </div>
  );
}
