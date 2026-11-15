import React, { useEffect, useState, useCallback } from 'react';
import { api, setPasscode, hasPasscode } from './lib/api.js';
import Unlock from './components/Unlock.jsx';
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
  const [spending, setSpending] = useState(null);
  const [locked, setLocked] = useState(!hasPasscode());
  const [unlockError, setUnlockError] = useState('');
  const [toast, setToast] = useState(null);
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [acctModal, setAcctModal] = useState(null); // { type, account|null }

  const showToast = useCallback((msg, isError) => {
    setToast({ msg, isError, key: Date.now() });
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const month = new Date().toLocaleDateString('en-CA').slice(0, 7);
      const [accRes, txRes] = await Promise.all([api.getAccounts(month), api.getTransactions()]);
      setAccounts(accRes.accounts);
      setNetWorth(accRes.netWorth);
      setSpending(accRes.spending);
      setLocked(false);
      setTransactions([...txRes.transactions].sort((a, b) => (a.date < b.date ? 1 : -1)));
    } catch (err) {
      if (err.status === 401) {
        setUnlockError(hasPasscode() ? 'That passcode didn\'t work. Try again.' : '');
        setPasscode('');
        setLocked(true);
        return;
      }
      showToast('Failed to load: ' + err.message, true);
    }
  }, [showToast]);

  useEffect(() => { if (hasPasscode()) loadAll(); }, [loadAll]);

  const accountName = (id) => accounts.find(a => a.id === id)?.name || '—';
  const byType = (type) => accounts.filter(a => a.type === type);

  const pageProps = { setPage, accounts, transactions, netWorth, spending, byType, accountName, showToast, reload: loadAll, openAccountModal: setAcctModal };

  if (locked) {
    return <Unlock error={unlockError} onUnlock={code => { setPasscode(code); loadAll(); }} />;
  }

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
        className="fixed bottom-5 right-5 bg-blue text-white font-medium text-sm px-5 py-3 rounded-full
                   shadow-[0_8px_24px_rgba(0,56,168,0.35)] hover:bg-[#002a82] active:scale-[0.98] transition z-20"
      >
        Record transaction
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
