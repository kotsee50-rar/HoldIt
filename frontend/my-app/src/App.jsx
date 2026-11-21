import { useEffect, useState } from "react";
import { useBridge } from "./hooks/useBridge.js";
import { useBook } from "./hooks/useBook.js";
import { StatusBar } from "./components/StatusBar.jsx";
import { NaivePanel } from "./components/NaivePanel.jsx";
import { GuardedPanel } from "./components/GuardedPanel.jsx";
import { OrderBookPanel } from "./components/OrderBookPanel.jsx";
import { ReplayBar } from "./components/ReplayBar.jsx";

const DEFAULT_AMOUNT = 100000; // a smaller amount shows almost no naive slippage on the demo ladder
const DEFAULT_SLIPPAGE = 0.5;

export default function App() {
  const { state, execute, replay } = useBridge();
  const book = useBook();
  const refreshBook = book.refresh;
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [maxSlippage, setMaxSlippage] = useState(DEFAULT_SLIPPAGE);

  // Refresh the book when a run ends, so the depth shown is the one after the sale.
  useEffect(() => {
    if (!state.busy) refreshBook();
  }, [state.busy, refreshBook]);

  // Offline bridge (503 on /execute) or a run already in progress: no new sale.
  const canRun = state.connected && state.online !== false && !state.busy;
  // Replays never touch the ledger, so they only wait for the bridge to be idle.
  const canReplay = state.connected && !state.busy;

  const runNaive = () => execute({ mode: "naive", amount: Number(amount) });
  const runGuarded = () => execute({ mode: "guarded", amount: Number(amount), maxSlippage: Number(maxSlippage) });

  return (
    <div className="min-h-screen bg-ghost p-6 font-sans text-shadow md:p-8">
      <header className="mb-6 border-b border-silver pb-4">
        <h1 className="bg-gradient-to-r from-shadow to-frost bg-clip-text text-4xl font-black text-transparent">
          HoldIt!
        </h1>
        <p className="mt-2 text-shadow/70">Execution Engine for DAOs on XRPL</p>
      </header>

      <StatusBar state={state} />

      <section className="mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-silver bg-silver/30 p-4">
        <label className="text-sm text-shadow/70">
          Amount (TGD)
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 block w-40 rounded-lg border border-pale bg-ghost px-3 py-2 font-mono text-shadow focus:border-frost focus:outline-none focus:ring-2 focus:ring-frost"
          />
        </label>
        <label className="text-sm text-shadow/70">
          Slippage mandate (%)
          <input
            type="number"
            min="0.01"
            step="0.1"
            value={maxSlippage}
            onChange={(e) => setMaxSlippage(e.target.value)}
            className="mt-1 block w-40 rounded-lg border border-pale bg-ghost px-3 py-2 font-mono text-shadow focus:border-frost focus:outline-none focus:ring-2 focus:ring-frost"
          />
        </label>
        {state.error && (
          <p className="rounded-lg bg-shadow px-3 py-2 text-sm font-semibold text-ghost" role="alert">Error: {state.error}</p>
        )}
      </section>

      <ReplayBar onReplay={replay} canReplay={canReplay} />

      <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <NaivePanel naive={state.naive} onRun={runNaive} canRun={canRun} />
        <GuardedPanel guarded={state.guarded} onRun={runGuarded} canRun={canRun} />
      </div>

      <OrderBookPanel book={book} />
    </div>
  );
}
