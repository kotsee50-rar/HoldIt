import { toBookRows, totalDepth } from "../lib/book.js";

export function OrderBookPanel({ book }) {
  const data = book.data;
  const rows = toBookRows(data?.bids);
  const depth = totalDepth(data?.bids);

  return (
    <section className="rounded-2xl border border-silver bg-silver/30 p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-shadow">Order book (bid TGD)</h2>
        <span className="font-mono text-xs text-shadow/70">
          {data?.offline ? "Ladder configurato (bridge offline)" : "Bid correnti sul testnet"}
          {data && ` · profondità ${depth.toLocaleString("it-IT")} TGD`}
        </span>
      </div>

      {book.status === "error" && (
        <p className="rounded-lg bg-shadow px-3 py-2 text-sm font-semibold text-ghost">Errore: {book.error}</p>
      )}
      {book.status === "loading" && <p className="text-sm text-shadow/70">Caricamento del book...</p>}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs text-shadow">
            <thead>
              <tr className="border-b border-shadow/30 text-left text-shadow/70">
                <th className="py-2 pr-3 font-normal">Livello</th>
                <th className="py-2 pr-3 font-normal">Prezzo (XRP/TGD)</th>
                <th className="py-2 pr-3 font-normal">TGD</th>
                <th className="py-2 pr-3 font-normal">XRP</th>
                <th className="w-1/3 py-2 font-normal">Profondità</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.level} className="border-b border-silver">
                  <td className="py-2 pr-3">L{row.level}</td>
                  <td className="py-2 pr-3">{row.price.toFixed(8)}</td>
                  <td className="py-2 pr-3">{row.tokens.toLocaleString("it-IT")}</td>
                  <td className="py-2 pr-3">{row.xrp.toFixed(4)}</td>
                  <td className="py-2">
                    <div className="h-2 overflow-hidden rounded-full bg-silver">
                      <div className="h-full bg-frost" style={{ width: `${row.widthPct}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-shadow/70">
        Liquidità simulata: il market maker del progetto ricarica i livelli a prezzi fissi. Non è un mercato reale.
      </p>
    </section>
  );
}
