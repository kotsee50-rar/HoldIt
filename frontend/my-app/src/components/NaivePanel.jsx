export function NaivePanel({ naive, onRun, canRun }) {
  const running = naive.status === "running" || naive.status === "preparing";
  const result = naive.result;

  return (
    <div className="rounded-2xl border border-silver bg-silver/30 p-6">
      <h2 className="mb-2 text-2xl font-bold text-shadow">The Naive Way</h2>
      <p className="mb-6 text-sm text-shadow/70">
        Vendi l'intero ammontare in un solo ordine. L'order book si svuota e lo slippage consuma il capitale.
      </p>

      <button
        type="button"
        onClick={onRun}
        disabled={!canRun}
        className="mb-6 w-full rounded-xl bg-shadow py-4 font-bold text-ghost transition-colors hover:bg-shadow/85 disabled:cursor-not-allowed disabled:bg-pale"
      >
        {running ? "Esecuzione in corso..." : "Esegui Market Sell (naive)"}
      </button>

      <div className="rounded-lg border border-shadow/30 bg-ghost p-4">
        <h3 className="mb-2 font-semibold text-shadow">Impatto stimato</h3>
        <p className="font-mono text-3xl font-bold text-shadow">
          {result ? `${result.slippagePct.toFixed(2)}%` : running ? "..." : "??%"}
        </p>
        <p className="mt-2 text-sm text-shadow/70">
          {result
            ? `${result.sold} TGD venduti per ${result.receivedXRP.toFixed(6)} XRP`
            : "Slippage su ordine singolo"}
        </p>
      </div>
    </div>
  );
}
