import { BRIDGE_URL } from "../lib/bridge.js";

function describe(state) {
  if (!state.connected) return { text: "Bridge non connesso", tone: "text-red-400" };
  if (state.online === false) return { text: "Bridge offline: solo replay disponibile", tone: "text-yellow-400" };
  if (state.busy) return { text: "Run in corso", tone: "text-blue-400" };
  return { text: "Pronto", tone: "text-emerald-400" };
}

export function StatusBar({ state }) {
  const { text, tone } = describe(state);
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm">
      <span className={`font-semibold ${tone}`}>{text}</span>
      <span className="font-mono text-xs text-slate-500">{BRIDGE_URL}</span>
    </div>
  );
}
