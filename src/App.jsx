import React, { useEffect, useState, useCallback } from 'react';
import { api } from './lib/api.js';
import Nav from './components/Nav.jsx';
import Dashboard from './components/Dashboard.jsx';
import CreditCards from './components/CreditCards.jsx';
import Loans from './components/Loans.jsx';
import Savings from './components/Savings.jsx';
import Transactions from './components/Transactions.jsx';
import TxModal from './components/TxModal.jsx';
import AccountModal from './components/AccountModal.jsx';
import Toast from './components/Toast.jsx';

const PAGES = ['dashboard', 'creditcards', 'loans', 'savings', 'transactions'];

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [netWorth, setNetWorth] = useState({ savings: 0, cardDebt: 0, loanDebt: 0, netWorth: 0 });
  const [toast, setToast] = useState(null);
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [acctModal, setAcctModal] = useState(null); // { type, account|null }

  const showToast = useCallback((msg, isError) => {
    setToast({ msg, isError, key: Date.now() });
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [accRes, txRes] = await Promise.all([api.getAccounts(), api.getTransactions()]);
      setAccounts(accRes.accounts);
      setNetWorth(accRes.netWorth);
      setTransactions([...txRes.transactions].sort((a, b) => (a.date < b.date ? 1 : -1)));
    } catch (err) {
      showToast('Failed to load: ' + err.message, true);
    }
  }, [showToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const accountName = (id) => accounts.find(a => a.id === id)?.name || '—';
  const byType = (type) => accounts.filter(a => a.type === type);

  const pageProps = { accounts, transactions, netWorth, byType, accountName, showToast, reload: loadAll, openAccountModal: setAcctModal };

  return (
    <div className="max-w-[1080px] mx-auto px-5 pt-7 pb-24">
      <Nav page={page} setPage={setPage} pages={PAGES} />

      {page === 'dashboard' && <Dashboard {...pageProps} />}
      {page === 'creditcards' && <CreditCards {...pageProps} />}
      {page === 'loans' && <Loans {...pageProps} />}
      {page === 'savings' && <Savings {...pageProps} />}
      {page === 'transactions' && <Transactions {...pageProps} />}

      <button
        onClick={() => setTxModalOpen(true)}
        title="Add income, expense, or transfer"
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gold text-surface text-3xl leading-none
                   flex items-center justify-center shadow-[0_10px_30px_rgba(0,0,0,0.35)]
                   hover:scale-105 transition-transform z-20"
      >
        +
      </button>

      {txModalOpen && (
        <TxModal
          accounts={accounts}
          onClose={() => setTxModalOpen(false)}
          onSaved={async () => { setTxModalOpen(false); showToast('Saved'); await loadAll(); }}
          showError={(msg) => showToast(msg, true)}
        />
      )}

      {acctModal && (
        <AccountModal
          type={acctModal.type}
          account={acctModal.account}
          onClose={() => setAcctModal(null)}
          onSaved={async (msg) => { setAcctModal(null); showToast(msg || 'Saved'); await loadAll(); }}
          showError={(msg) => showToast(msg, true)}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}
