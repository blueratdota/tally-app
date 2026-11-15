import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { api, setPasscode, hasPasscode, ApiError, type Account, type AccountType, type NetWorth, type Spending, type Transaction, type View } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Toaster } from '@/components/ui/sonner';
import { VIEWS } from '@/lib/format';
import Unlock from '@/components/Unlock';
import Dashboard from '@/components/Dashboard';
import CreditCards from '@/components/CreditCards';
import Loans from '@/components/Loans';
import Savings from '@/components/Savings';
import Transactions from '@/components/Transactions';
import TxModal from '@/components/TxModal';
import AccountModal from '@/components/AccountModal';

export type Page = 'dashboard' | 'creditcards' | 'loans' | 'savings' | 'transactions';
const PAGES: [Page, string][] = [
  ['dashboard', 'Overview'], ['creditcards', 'Credit cards'], ['loans', 'Loans'], ['savings', 'Savings'], ['transactions', 'Transactions']
];
const ZERO: NetWorth = { savings: 0, cardDebt: 0, futureDebt: 0, loanDebt: 0, netWorth: 0 };

export type OpenAccountModal = (m: { type: AccountType; account: Account | null }) => void;

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [view, setView] = useState<View>('all');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [netWorthByView, setNetWorthByView] = useState<Record<View, NetWorth> | null>(null);
  const [spending, setSpending] = useState<Spending | null>(null);
  const [locked, setLocked] = useState(!hasPasscode());
  const [unlockError, setUnlockError] = useState('');
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [acctModal, setAcctModal] = useState<{ type: AccountType; account: Account | null } | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const month = new Date().toLocaleDateString('en-CA').slice(0, 7);
      const [accRes, txRes] = await Promise.all([api.getAccounts(month), api.getTransactions()]);
      setAccounts(accRes.accounts);
      setNetWorthByView(accRes.netWorthByView);
      setSpending(accRes.spending);
      setLocked(false);
      setTransactions([...txRes.transactions].sort((a, b) => (a.date < b.date ? 1 : -1)));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUnlockError(hasPasscode() ? "That passcode didn't work. Try again." : '');
        setPasscode('');
        setLocked(true);
        return;
      }
      toast.error('Failed to load: ' + (err as Error).message);
    }
  }, []);

  useEffect(() => { if (hasPasscode()) loadAll(); }, [loadAll]);

  const accountName = (id?: string) => accounts.find(a => a.id === id)?.name || '—';
  // Person switch is client-side only: that person's accounts plus shared ones.
  const shownAccounts = view === 'all' ? accounts : accounts.filter(a => a.owner === view || a.owner === 'shared');
  const byType = (type: AccountType) => shownAccounts.filter(a => a.type === type);
  const netWorth = netWorthByView?.[view] || ZERO;
  const shownTx = view === 'all' ? transactions : transactions.filter(t => t.person === view);
  const openAccountModal: OpenAccountModal = setAcctModal;

  if (locked) {
    return <Unlock error={unlockError} onUnlock={code => { setPasscode(code); loadAll(); }} />;
  }

  return (
    <div className="max-w-[1080px] mx-auto px-5 pt-7 pb-24">
      <header className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="font-display text-2xl font-bold tracking-tight">Tally</div>
        <ToggleGroup type="single" variant="outline" size="sm" aria-label="View"
          value={view} onValueChange={v => v && setView(v as View)}>
          {VIEWS.map(([id, name]) => <ToggleGroupItem key={id} value={id} className="rounded-full px-3 data-[state=on]:bg-foreground data-[state=on]:text-background">{name}</ToggleGroupItem>)}
        </ToggleGroup>
      </header>

      <Tabs value={page} onValueChange={v => setPage(v as Page)}>
        <TabsList className="mb-8 w-full justify-start overflow-x-auto">
          {PAGES.map(([id, label]) => <TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}
        </TabsList>
        {!netWorthByView ? (
          <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading">
            <div className="h-28 bg-muted rounded" />
            <div className="h-48 bg-muted rounded" />
            <div className="h-48 bg-muted rounded" />
          </div>
        ) : <>
        <TabsContent value="dashboard"><Dashboard netWorth={netWorth} spending={spending} byType={byType} setPage={setPage} view={view} /></TabsContent>
        <TabsContent value="creditcards"><CreditCards byType={byType} openAccountModal={openAccountModal} /></TabsContent>
        <TabsContent value="loans"><Loans byType={byType} openAccountModal={openAccountModal} /></TabsContent>
        <TabsContent value="savings"><Savings byType={byType} openAccountModal={openAccountModal} /></TabsContent>
        <TabsContent value="transactions"><Transactions transactions={shownTx} accountName={accountName} reload={loadAll} /></TabsContent>
        </>}
      </Tabs>

      <Button onClick={() => setTxModalOpen(true)} size="lg"
        className="fixed bottom-5 right-5 rounded-full shadow-[0_8px_24px_rgba(0,56,168,0.35)] z-20">
        Record transaction
      </Button>

      {txModalOpen && (
        <TxModal accounts={accounts}
          onClose={() => setTxModalOpen(false)}
          onSaved={async () => { setTxModalOpen(false); toast('Saved'); await loadAll(); }} />
      )}

      {acctModal && (
        <AccountModal type={acctModal.type} account={acctModal.account}
          onClose={() => setAcctModal(null)}
          onSaved={async msg => { setAcctModal(null); toast(msg || 'Saved'); await loadAll(); }} />
      )}

      <Toaster position="bottom-center" />
    </div>
  );
}
