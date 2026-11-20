// Replays of the two recorded demo runs. They never touch the ledger.
export function ReplayBar({ onReplay, canReplay }) {
  return (
    <section className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-silver bg-silver/30 p-4">
      <span className="text-sm text-shadow/70">Riproduci una demo registrata (funziona anche senza testnet):</span>
      <button
        type="button"
        onClick={() => onReplay("demo-naive")}
        disabled={!canReplay}
        className="rounded-lg bg-shadow px-4 py-2 text-sm font-semibold text-ghost transition-colors hover:bg-shadow/85 disabled:cursor-not-allowed disabled:bg-pale"
      >
        Replay naive
      </button>
      <button
        type="button"
        onClick={() => onReplay("demo-guarded")}
        disabled={!canReplay}
        className="rounded-lg bg-frost px-4 py-2 text-sm font-semibold text-shadow transition-colors hover:bg-frost/80 disabled:cursor-not-allowed disabled:bg-pale disabled:text-ghost"
      >
        Replay guarded
      </button>
    </section>
  );
}
