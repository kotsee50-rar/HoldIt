export function GuardedPanel({ guarded, onRun, canRun }) {
  const running = guarded.status === "running";
  const result = guarded.result;

  return (
    <div className="rounded-2xl border-2 border-frost bg-silver/30 p-6">
      <h2 className="mb-4 text-2xl font-bold text-shadow">TreasuryGuard Engine</h2>
      <p className="mb-6 text-sm text-shadow/70">
        L'Agente spezza l'ordine in chunk sicuri, protetti da un floor di prezzo on-chain.
      </p>

      <button
        type="button"
        onClick={onRun}
        disabled={!canRun}
        className="mb-6 w-full rounded-xl bg-frost py-4 font-bold text-shadow shadow-[0_0_15px_rgba(177,229,242,0.6)] transition-all hover:bg-frost/80 disabled:cursor-not-allowed disabled:bg-pale disabled:text-ghost disabled:shadow-none"
      >
        {running ? "Esecuzione in corso..." : "🛡️ Avvia Esecuzione Protetta"}
      </button>

      <div className="mb-3 flex items-center justify-between font-mono text-xs text-shadow">
        <span>Avanzamento {guarded.progressPct.toFixed(0)}%</span>
        <span className="font-semibold">Slippage Attuale: {guarded.slippagePct.toFixed(3)}%</span>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-silver">
        <div
          className="h-full bg-frost transition-all duration-500"
          style={{ width: `${Math.min(100, guarded.progressPct)}%` }}
        />
      </div>

      <div className="flex h-64 flex-col rounded-lg border border-shadow bg-shadow p-4">
        <span className="mb-2 border-b border-shadow/60 pb-2 font-mono text-xs text-ghost/70">TERMINALE</span>
        <div className="flex-1 space-y-1 overflow-y-auto font-mono text-xs">
          {guarded.log.length === 0 && <p className="text-ghost/60">In attesa di comandi...</p>}
          {guarded.log.map((text, i) => (
            <p key={i} className={toneFor(text)}>{text}</p>
          ))}
        </div>
      </div>

      {result && (
        <p className="mt-4 text-sm text-shadow">
          Risultato: {result.sold} TGD per {result.receivedXRP.toFixed(6)} XRP, slippage {result.slippagePct.toFixed(3)}%, stato {result.status}.
        </p>
      )}
    </div>
  );
}

// Terminal colours from the palette: chunks in frost, waits in silver, failures bold and underlined.
function toneFor(text) {
  if (text.includes("[CHUNK") || text.includes("[START")) return "text-frost";
  if (text.includes("[WAIT")) return "text-silver italic";
  if (text.includes("[HALT") || text.includes("FAILED") || text.includes("[KILLED")) return "font-bold text-ghost underline";
  return "text-ghost/80";
}
