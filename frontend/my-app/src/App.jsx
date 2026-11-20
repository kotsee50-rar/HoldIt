import { useState } from "react";
import { useBridge } from "./hooks/useBridge.js";
import { StatusBar } from "./components/StatusBar.jsx";
import { NaivePanel } from "./components/NaivePanel.jsx";
import { GuardedPanel } from "./components/GuardedPanel.jsx";

const DEFAULT_AMOUNT = 100000;
const DEFAULT_SLIPPAGE = 0.5;

export default function App() {
  const { state, execute } = useBridge();
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [maxSlippage, setMaxSlippage] = useState(DEFAULT_SLIPPAGE);

  // Offline bridge (503 on /execute) or a run already in progress: no new sale.
  const canRun = state.connected && state.online !== false && !state.busy;

  const runNaive = () => execute({ mode: "naive", amount: Number(amount) });
  const runGuarded = () => execute({ mode: "guarded", amount: Number(amount), maxSlippage: Number(maxSlippage) });

  return (
    <div className="min-h-screen bg-ghost p-6 font-sans text-shadow md:p-8">
      <header className="mb-6 border-b border-silver pb-4">
        <h1 className="text-4xl font-black text-shadow">
          TreasuryGuard
        </h1>
        <p className="mt-2 text-shadow/70">Execution engine per tesorerie DAO su XRPL, Testnet</p>
      </header>

      <StatusBar state={state} />

      <section className="mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-silver bg-silver/30 p-4">
        <label className="text-sm text-shadow/70">
          Quantità (TGD)
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 block w-40 rounded-lg border border-pale bg-ghost px-3 py-2 font-mono text-shadow focus:border-frost focus:outline-none focus:ring-2 focus:ring-frost"
          />
        </label>
        <label className="text-sm text-shadow/70">
          Mandato di slippage (%)
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
          <p className="rounded-lg bg-shadow px-3 py-2 text-sm font-semibold text-ghost" role="alert">Errore: {state.error}</p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <NaivePanel naive={state.naive} onRun={runNaive} canRun={canRun} />
        <GuardedPanel guarded={state.guarded} onRun={runGuarded} canRun={canRun} />
      </div>
    </div>
  );
}
