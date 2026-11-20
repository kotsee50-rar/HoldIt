export function NaivePanel({ naive, onRun, canRun }) {
  const running = naive.status === "running" || naive.status === "preparing";
  const result = naive.result;

  return (
    <div className="rounded-2xl border border-red-900/50 bg-slate-900 p-6">
      <h2 className="mb-2 text-2xl font-bold text-red-400">The Naive Way</h2>
      <p className="mb-6 text-sm text-slate-400">
        Vendi l'intero ammontare in un solo ordine. L'order book crolla e lo slippage consuma il capitale.
      </p>

      <button
        type="button"
        onClick={onRun}
        disabled={!canRun}
        className="mb-6 w-full rounded-xl bg-red-600 py-4 font-bold transition-all hover:bg-red-500 disabled:bg-slate-700"
      >
        {running ? "Esecuzione in corso..." : "Esegui Market Sell (naive)"}
      </button>

      <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-4">
        <h3 className="mb-2 font-semibold text-red-400">Impatto stimato</h3>
        <p className="font-mono text-3xl text-red-300">
          {result ? `${result.slippagePct.toFixed(2)}%` : running ? "..." : "??%"}
        </p>
        <p className="mt-2 text-sm text-red-400/70">
          {result
            ? `${result.sold} TGD venduti per ${result.receivedXRP.toFixed(6)} XRP`
            : "Slippage su ordine singolo"}
        </p>
      </div>
    </div>
  );
}
