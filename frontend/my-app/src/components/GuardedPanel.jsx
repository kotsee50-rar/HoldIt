export function GuardedPanel({ guarded, onRun, canRun }) {
  const running = guarded.status === "running";
  const result = guarded.result;

  return (
    <div className="rounded-2xl border border-emerald-900/50 bg-slate-900 p-6">
      <h2 className="mb-2 text-2xl font-bold text-emerald-400">TreasuryGuard Engine</h2>
      <p className="mb-6 text-sm text-slate-400">
        L'agente spezza l'ordine in chunk, ognuno protetto da un prezzo minimo verificato dal ledger.
      </p>

      <button
        type="button"
        onClick={onRun}
        disabled={!canRun}
        className="mb-6 w-full rounded-xl bg-emerald-600 py-4 font-bold shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all hover:bg-emerald-500 disabled:bg-slate-700"
      >
        {running ? "Esecuzione in corso..." : "Avvia esecuzione protetta"}
      </button>

      <div className="mb-3 flex items-center justify-between font-mono text-xs">
        <span className="text-slate-500">Avanzamento {guarded.progressPct.toFixed(0)}%</span>
        <span className="text-emerald-400">Slippage attuale: {guarded.slippagePct.toFixed(3)}%</span>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${Math.min(100, guarded.progressPct)}%` }}
        />
      </div>

      <div className="flex h-64 flex-col rounded-lg border border-slate-800 bg-slate-950 p-4">
        <span className="mb-2 border-b border-slate-800 pb-2 font-mono text-xs text-slate-500">TERMINALE</span>
        <div className="flex-1 space-y-1 overflow-y-auto font-mono text-xs">
          {guarded.log.length === 0 && <p className="text-slate-600">In attesa di comandi...</p>}
          {guarded.log.map((text, i) => (
            <p key={i} className={toneFor(text)}>{text}</p>
          ))}
        </div>
      </div>

      {result && (
        <p className="mt-4 text-sm text-slate-300">
          Risultato: {result.sold} TGD per {result.receivedXRP.toFixed(6)} XRP, slippage {result.slippagePct.toFixed(3)}%, stato {result.status}.
        </p>
      )}
    </div>
  );
}

function toneFor(text) {
  if (text.includes("[CHUNK")) return "text-emerald-400";
  if (text.includes("[WAIT")) return "text-yellow-400";
  if (text.includes("[HALT") || text.includes("FAILED") || text.includes("[KILLED")) return "text-red-400";
  if (text.includes("[SYSTEM") || text.includes("[START")) return "text-blue-400";
  return "text-slate-400";
}
