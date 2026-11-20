import { useState, useEffect, useRef } from 'react';
import { Client, Wallet, dropsToXrp } from 'xrpl';

// Connessione al Testnet pubblico di XRPL
const TESTNET_URL = 'wss://s.altnet.rippletest.net:51233';

function App() {
  const [client, setClient] = useState(null);
  const [clientWallet, setClientWallet] = useState(null);
  const [freelancerWallet, setFreelancerWallet] = useState(null);
  const [clientBalance, setClientBalance] = useState('0');
  const [freelancerBalance, setFreelancerBalance] = useState('0');
  const [status, setStatus] = useState('Non connesso');
  const [txHash, setTxHash] = useState('');
  const [escrowInfo, setEscrowInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [log, setLog] = useState([]);

  const clientRef = useRef(null);

  const addLog = (msg) => {
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 8));
  };

  // 1. Connessione al ledger e creazione di due wallet demo
  const connectAndCreateWallets = async () => {
    setIsLoading(true);
    setStatus('Connessione al Testnet XRPL...');
    try {
      const newClient = new Client(TESTNET_URL);
      await newClient.connect();
      setClient(newClient);
      clientRef.current = newClient;
      addLog('Connesso al Testnet XRPL');

      setStatus('Creazione wallet cliente...');
      const { wallet: cWallet } = await newClient.fundWallet();
      setClientWallet(cWallet);
      addLog(`Wallet cliente creato: ${cWallet.classicAddress.slice(0, 8)}...`);

      setStatus('Creazione wallet freelancer...');
      const { wallet: fWallet } = await newClient.fundWallet();
      setFreelancerWallet(fWallet);
      addLog(`Wallet freelancer creato: ${fWallet.classicAddress.slice(0, 8)}...`);

      await updateBalances(newClient, cWallet.classicAddress, fWallet.classicAddress);
      setStatus('Pronto');
    } catch (error) {
      console.error(error);
      setStatus('Errore di connessione. Riprova.');
      addLog(`Errore: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const updateBalances = async (xrplClient, clientAddr, freelancerAddr) => {
    try {
      const cRes = await xrplClient.request({
        command: 'account_info',
        account: clientAddr,
        ledger_index: 'validated',
      });
      setClientBalance(dropsToXrp(cRes.result.account_data.Balance));

      const fRes = await xrplClient.request({
        command: 'account_info',
        account: freelancerAddr,
        ledger_index: 'validated',
      });
      setFreelancerBalance(dropsToXrp(fRes.result.account_data.Balance));
    } catch (e) {
      console.error('Errore aggiornamento saldi', e);
    }
  };

  // 2. Il cliente blocca i fondi in escrow verso il freelancer
  const createEscrow = async () => {
    if (!client || !clientWallet || !freelancerWallet) return;
    setIsLoading(true);
    setStatus('Creazione escrow in corso...');
    setTxHash('');
    try {
      const amountToLock = '1000000'; // 1 XRP in drops

      const escrowCreate = {
        TransactionType: 'EscrowCreate',
        Account: clientWallet.classicAddress,
        Destination: freelancerWallet.classicAddress,
        Amount: amountToLock,
      };

      const prepared = await client.autofill(escrowCreate);
      const signed = clientWallet.sign(prepared);
      const result = await client.submitAndWait(signed.tx_json);

      if (result.result.meta.TransactionResult === 'tesSUCCESS') {
        setTxHash(result.result.hash);
        setStatus('Escrow creato con successo!');
        addLog('Escrow creato: 1 XRP bloccato dal cliente');
        setEscrowInfo({
          txHash: result.result.hash,
          sequence: result.result.tx_json.Sequence,
          owner: clientWallet.classicAddress,
          destination: freelancerWallet.classicAddress,
          amount: amountToLock,
        });
        await updateBalances(client, clientWallet.classicAddress, freelancerWallet.classicAddress);
      } else {
        setStatus(`Errore: ${result.result.meta.TransactionResult}`);
        addLog(`Errore escrow: ${result.result.meta.TransactionResult}`);
      }
    } catch (error) {
      console.error(error);
      setStatus("Errore durante la creazione dell'escrow.");
      addLog(`Errore: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Rilascio dei fondi (chiusura escrow)
  const finishEscrow = async () => {
    if (!client || !clientWallet || !escrowInfo) return;
    setIsLoading(true);
    setStatus('Chiusura escrow in corso...');
    try {
      const escrowFinish = {
        TransactionType: 'EscrowFinish',
        Account: clientWallet.classicAddress,
        Owner: escrowInfo.owner,
        OfferSequence: escrowInfo.sequence,
      };

      const prepared = await client.autofill(escrowFinish);
      const signed = clientWallet.sign(prepared);
      const result = await client.submitAndWait(signed.tx_json);

      if (result.result.meta.TransactionResult === 'tesSUCCESS') {
        setTxHash(result.result.hash);
        setStatus('Escrow chiuso! Fondi rilasciati al freelancer.');
        addLog('Escrow chiuso: fondi rilasciati al freelancer');
        setEscrowInfo(null);
        await updateBalances(client, clientWallet.classicAddress, freelancerWallet.classicAddress);
      } else {
        setStatus(`Errore nella chiusura: ${result.result.meta.TransactionResult}`);
        addLog(`Errore chiusura: ${result.result.meta.TransactionResult}`);
      }
    } catch (error) {
      console.error(error);
      setStatus("Errore durante la chiusura dell'escrow.");
      addLog(`Errore: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Annullamento escrow (opzionale, in caso di dispute)
  const cancelEscrow = async () => {
    if (!client || !clientWallet || !escrowInfo) return;
    setIsLoading(true);
    setStatus('Annullamento escrow in corso...');
    try {
      const escrowCancel = {
        TransactionType: 'EscrowCancel',
        Account: clientWallet.classicAddress,
        Owner: escrowInfo.owner,
        OfferSequence: escrowInfo.sequence,
      };

      const prepared = await client.autofill(escrowCancel);
      const signed = clientWallet.sign(prepared);
      const result = await client.submitAndWait(signed.tx_json);

      if (result.result.meta.TransactionResult === 'tesSUCCESS') {
        setTxHash(result.result.hash);
        setStatus('Escrow annullato. Fondi restituiti al cliente.');
        addLog('Escrow annullato: fondi restituiti al cliente');
        setEscrowInfo(null);
        await updateBalances(client, clientWallet.classicAddress, freelancerWallet.classicAddress);
      } else {
        setStatus(`Errore nell'annullamento: ${result.result.meta.TransactionResult}`);
      }
    } catch (error) {
      console.error(error);
      setStatus("Errore durante l'annullamento dell'escrow.");
      addLog(`Errore: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 font-sans">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-1 bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
          GigSecure
        </h1>
        <p className="text-slate-400 mb-6">Escrow trustless per freelance su XRP Ledger (Testnet)</p>

        {/* Stato globale */}
        <div className="bg-slate-800 rounded-xl p-4 mb-4 border border-slate-700 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Stato</p>
            <p className="font-mono text-emerald-400">{status}</p>
          </div>
          {clientWallet && (
            <button
              onClick={() => updateBalances(client, clientWallet.classicAddress, freelancerWallet.classicAddress)}
              className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded"
            >
              Aggiorna saldi
            </button>
          )}
        </div>

        {!clientWallet ? (
          <button
            onClick={connectAndCreateWallets}
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            {isLoading ? 'Connessione...' : 'Connetti Wallet Demo'}
          </button>
        ) : (
          <>
            {/* Due colonne: cliente e freelancer */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Cliente */}
              <div className="bg-slate-800 rounded-xl p-4 border border-blue-700/50">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold text-blue-400">👤 Cliente</h2>
                  <span className="text-xs bg-blue-900/50 text-blue-300 px-2 py-1 rounded">Paga</span>
                </div>
                <p className="text-2xl font-bold mb-1">{clientBalance} XRP</p>
                <p className="text-xs text-slate-500 font-mono break-all">{clientWallet.classicAddress}</p>
              </div>

              {/* Freelancer */}
              <div className="bg-slate-800 rounded-xl p-4 border border-emerald-700/50">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold text-emerald-400">💼 Freelancer</h2>
                  <span className="text-xs bg-emerald-900/50 text-emerald-300 px-2 py-1 rounded">Riceve</span>
                </div>
                <p className="text-2xl font-bold mb-1">{freelancerBalance} XRP</p>
                <p className="text-xs text-slate-500 font-mono break-all">{freelancerWallet.classicAddress}</p>
              </div>
            </div>

            {/* Pannello azioni */}
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Azioni</h3>
              <div className="flex flex-wrap gap-3">
                {!escrowInfo ? (
                  <button
                    onClick={createEscrow}
                    disabled={isLoading}
                    className="flex-1 min-w-[200px] bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                  >
                    {isLoading ? 'Creazione...' : '🔒 Blocca 1 XRP in Escrow'}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={finishEscrow}
                      disabled={isLoading}
                      className="flex-1 min-w-[180px] bg-amber-600 hover:bg-amber-500 disabled:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                    >
                      {isLoading ? 'Chiusura...' : '✅ Rilascia Fondi'}
                    </button>
                    <button
                      onClick={cancelEscrow}
                      disabled={isLoading}
                      className="flex-1 min-w-[180px] bg-rose-700 hover:bg-rose-600 disabled:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                    >
                      {isLoading ? '...' : '↩️ Annulla Escrow'}
                    </button>
                  </>
                )}
              </div>
              {escrowInfo && (
                <p className="text-xs text-slate-500 mt-3">
                  Escrow attivo: Sequence #{escrowInfo.sequence} — 1 XRP bloccato
                </p>
              )}
            </div>

            {/* Link explorer */}
            {txHash && (
              <div className="mb-4 p-3 bg-slate-900 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-500 mb-1">Ultima transazione (verificabile on-chain)</p>
                <a
                  href={`https://testnet.xrpl.org/transactions/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-sm font-mono break-all underline"
                >
                  {txHash}
                </a>
              </div>
            )}

            {/* Log attività */}
            <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
              <h3 className="text-xs font-semibold text-slate-500 mb-2">Registro attività</h3>
              <div className="space-y-1 font-mono text-xs">
                {log.length === 0 ? (
                  <p className="text-slate-600">Nessuna attività</p>
                ) : (
                  log.map((entry, i) => (
                    <p key={i} className="text-slate-400">{entry}</p>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {/* Spiegazione per i giudici */}
        <div className="mt-6 p-4 bg-slate-800/50 rounded-lg border border-slate-700/50 text-sm text-slate-400">
          <p className="font-semibold text-slate-300 mb-2">Come funziona la demo:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Vengono creati due wallet demo (cliente e freelancer) finanziati dal faucet Testnet.</li>
            <li>Il cliente blocca 1 XRP in un escrow nativo XRPL verso il freelancer.</li>
            <li>Il rilascio avviene solo alla consegna del lavoro (simulato manualmente).</li>
            <li>Ogni transazione è verificabile sul ledger pubblico tramite il link all'explorer.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default App;