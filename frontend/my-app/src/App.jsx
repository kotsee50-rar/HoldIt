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
    <div className="min-h-screen bg-slate-950 p-6 font-sans text-white md:p-8">
      <header className="mb-6 border-b border-slate-800 pb-4">
        <h1 className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-4xl font-black text-transparent">
          TreasuryGuard
        </h1>
        <p className="mt-2 text-slate-400">Execution engine per tesorerie DAO su XRPL, Testnet</p>
      </header>

      <StatusBar state={state} />

      <section className="mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <label className="text-sm text-slate-400">
          Quantità (TGD)
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 block w-40 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-white"
          />
        </label>
        <label className="text-sm text-slate-400">
          Mandato di slippage (%)
          <input
            type="number"
            min="0.01"
            step="0.1"
            value={maxSlippage}
            onChange={(e) => setMaxSlippage(e.target.value)}
            className="mt-1 block w-40 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-white"
          />
        </label>
        {state.error && (
          <p className="text-sm text-red-400" role="alert">{state.error}</p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <NaivePanel naive={state.naive} onRun={runNaive} canRun={canRun} />
        <GuardedPanel guarded={state.guarded} onRun={runGuarded} canRun={canRun} />
      </div>
    </div>
  );
}
