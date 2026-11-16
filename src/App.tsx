import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { ChartNoAxesColumnIncreasing, LayoutDashboard, ChartSpline, CreditCard, Landmark, Wallet, ArrowLeftRight, Plus, Settings, CalendarClock } from 'lucide-react';
import { api, setPasscode, hasPasscode, ApiError, type Account, type AccountType, type NetWorth, type NetWorthPoint, type Spending, type Transaction, type View, type Person, type Plan, type Goal, type HouseholdSettings } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Toaster } from '@/components/ui/sonner';
import { PEOPLE, CATEGORY_STYLES, localDate } from '@/lib/format';
import { PeopleContext, CategoryContext } from '@/lib/household';
import SettingsModal from '@/components/SettingsModal';
import CategoryStylesModal from '@/components/CategoryStylesModal';
import ScheduleManager from '@/components/ScheduleManager';
import Unlock from '@/components/Unlock';
import Dashboard from '@/components/Dashboard';
import CreditCards from '@/components/CreditCards';
import Loans from '@/components/Loans';
import Savings from '@/components/Savings';
import Transactions from '@/components/Transactions';
import Insights from '@/components/Insights';
import TxModal from '@/components/TxModal';
import AccountModal from '@/components/AccountModal';

export type Page = 'dashboard' | 'insights' | 'creditcards' | 'loans' | 'savings' | 'transactions';
const PAGES: [Page, string][] = [
  ['dashboard', 'Overview'], ['insights', 'Insights'], ['creditcards', 'Credit cards'], ['loans', 'Loans'], ['savings', 'Savings'], ['transactions', 'Transactions']
];
const PAGE_ICONS = { dashboard: LayoutDashboard, insights: ChartSpline, creditcards: CreditCard, loans: Landmark, savings: Wallet, transactions: ArrowLeftRight };
const ZERO: NetWorth = { savings: 0, cardDebt: 0, futureDebt: 0, loanDebt: 0, netWorth: 0 };

export type OpenAccountModal = (m: { type: AccountType; account: Account | null }) => void;

export default function App() {
  const [names, setNames] = useState<Record<Person, string>>(PEOPLE);
  const [categoryStyles, setCategoryStyles] = useState(CATEGORY_STYLES);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [schedulesOpen, setSchedulesOpen] = useState(false);
  const VIEWS: [View, string][] = [['all', 'Combined'], ...Object.entries(names) as [Person, string][]];
  const [page, setPage] = useState<Page>('dashboard');
  // Account the Transactions page opens filtered to (set by clicking a card); cleared on normal tab changes.
  const [txAccount, setTxAccount] = useState('');
  // Every page change opens at the top instead of keeping the last page's scroll position.
  const openPage = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const goTo = (p: Page) => { setTxAccount(''); openPage(p); };
  const [view, setView] = useState<View>('all');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [netWorthByView, setNetWorthByView] = useState<Record<View, NetWorth> | null>(null);
  const [historyByView, setHistoryByView] = useState<Record<View, NetWorthPoint[]> | null>(null);
  const [spending, setSpending] = useState<Spending | null>(null);
  const [locked, setLocked] = useState(!hasPasscode());
  const [unlockError, setUnlockError] = useState('');
  const [txModal, setTxModal] = useState<Transaction | 'new' | null>(null);
  const [acctModal, setAcctModal] = useState<{ type: AccountType; account: Account | null } | null>(null);

  const refreshId = useRef(0);
  const loadAll = useCallback(async () => {
    const request = ++refreshId.current;
    setUnlockError('');
    try {
      const month = localDate().slice(0, 7);
      const planRes = await api.getPlans();
      if (request !== refreshId.current) return;
      const [accRes, txRes, goalRes, settingsRes] = await Promise.all([api.getAccounts(month), api.getTransactions(), api.getGoals(), api.getSettings()]);
      if (request !== refreshId.current) return;
      setPlans(planRes.plans); setGoals(goalRes.goals); setNames(settingsRes.names); setCategoryStyles({ ...CATEGORY_STYLES, ...settingsRes.categories });
      setAccounts(accRes.accounts);
      setNetWorthByView(accRes.netWorthByView);
      setHistoryByView(accRes.historyByView);
      setSpending(accRes.spending);
      setLocked(false);
      setTransactions(txRes.transactions.sort((a, b) => (a.date < b.date ? 1 : -1)));
    } catch (err) {
      if (request !== refreshId.current) return;
      if (err instanceof ApiError && err.status === 401) {
        setUnlockError(hasPasscode() ? "That passcode didn't work. Try again." : '');
        setPasscode('');
        setLocked(true);
        return;
      }
      const message = 'Failed to load: ' + (err as Error).message;
      setUnlockError(message);
      toast.error(message);
    }
  }, []);

  useEffect(() => { if (hasPasscode()) loadAll(); }, [loadAll]);

  useEffect(() => {
    let day = localDate();
    const refresh = () => { if (hasPasscode() && document.visibilityState === 'visible') loadAll(); };
    const timer = window.setInterval(() => { if (localDate() !== day) { day = localDate(); refresh(); } }, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [loadAll]);

  const accountName = (id?: string) => accounts.find(a => a.id === id)?.name || '—';
  // Joint balances belong only to the combined view.
  const shownAccounts = view === 'all' ? accounts : accounts.filter(a => a.owner === view);
  const byType = (type: AccountType) => shownAccounts.filter(a => a.type === type);
  const netWorth = netWorthByView?.[view] || ZERO;
  const shownTx = view === 'all' ? transactions : transactions.filter(t => t.person === view);
  const openAccountModal: OpenAccountModal = setAcctModal;

  const applySettings = (value: HouseholdSettings) => { setNames(value.names); setCategoryStyles({ ...CATEGORY_STYLES, ...value.categories }); };

  if (locked) {
    return <Unlock error={unlockError} onUnlock={code => { setPasscode(code); loadAll(); }} />;
  }

  return (
    <PeopleContext.Provider value={names}><CategoryContext.Provider value={categoryStyles}><div className="app-shell max-w-[1200px] mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6 sm:mb-8">
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto"><div className="flex items-center gap-3">
          <span className="brand-mark"><ChartNoAxesColumnIncreasing className="size-5" aria-hidden="true" /></span>
          <div>
            <div className="font-display text-2xl font-extrabold tracking-tight leading-none">tally<span className="text-primary">.</span></div>
            <p className="text-[11px] text-muted-foreground mt-1 hidden lg:block">A little clarity for your money.</p>
          </div>
        </div><div className="flex gap-1 sm:hidden"><Button variant="ghost" size="icon" aria-label="Manage schedules" onClick={() => setSchedulesOpen(true)}><CalendarClock aria-hidden="true" /></Button><Button variant="ghost" size="icon" aria-label="Household settings" onClick={() => setSettingsOpen(true)}><Settings aria-hidden="true" /></Button></div></div>
        <div className="flex min-w-0 items-center gap-2 max-sm:w-full">
          <ToggleGroup type="single" size="sm" aria-label="View" className="min-w-0 rounded-full bg-white border p-1 max-sm:flex-1 sm:shrink-0"
            value={view} onValueChange={v => v && setView(v as View)}>
            {VIEWS.map(([id, name]) => <ToggleGroupItem key={id} value={id} className="min-w-0 flex-auto whitespace-nowrap rounded-full px-3 text-xs data-[state=on]:bg-foreground data-[state=on]:text-white sm:flex-none"><span className="truncate">{name}</span></ToggleGroupItem>)}
          </ToggleGroup>
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label="Manage schedules" onClick={() => setSchedulesOpen(true)}><CalendarClock aria-hidden="true" /></Button>
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label="Household settings" onClick={() => setSettingsOpen(true)}><Settings aria-hidden="true" /></Button>
          <Button onClick={() => setTxModal('new')} className="record-transaction rounded-full px-5 gap-2">
            <Plus aria-hidden="true" />Record transaction
          </Button>
        </div>
      </header>

      <Tabs value={page} onValueChange={v => goTo(v as Page)}>
        <TabsList aria-label="Main navigation" className="app-nav grid h-auto w-full grid-cols-6 gap-0.5 rounded-none sm:mb-8 sm:gap-2 sm:border-b sm:pb-4">
          {PAGES.map(([id, label]) => {
            const Icon = PAGE_ICONS[id];
            return <TabsTrigger key={id} value={id} aria-label={label} className="min-h-12 min-w-0 flex-col gap-1 rounded-xl px-0.5 py-2 text-[10px] data-[state=active]:bg-accent data-[state=active]:text-primary data-[state=active]:shadow-none sm:flex-row sm:gap-2 sm:px-2 sm:text-xs lg:text-sm">
              <Icon className="size-[18px] shrink-0" aria-hidden="true" />
              <span>{id === 'creditcards' ? <><span className="sm:hidden">Cards</span><span className="hidden sm:inline">{label}</span></> : id === 'transactions' ? <><span className="sm:hidden">Activity</span><span className="hidden sm:inline">{label}</span></> : label}</span>
            </TabsTrigger>;
          })}
        </TabsList>
        {!netWorthByView ? (
          <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading">
            <div className="h-28 bg-muted rounded" />
            <div className="h-48 bg-muted rounded" />
            <div className="h-48 bg-muted rounded" />
          </div>
        ) : <>
        <TabsContent value="dashboard"><Dashboard netWorth={netWorth} spending={spending} byType={byType} setPage={goTo} view={view} /></TabsContent>
        <TabsContent value="insights"><Insights transactions={shownTx.filter(t => t.date <= localDate())} history={historyByView?.[view] || []} view={view} onViewChange={setView} /></TabsContent>
        <TabsContent value="creditcards"><CreditCards byType={byType} openAccountModal={openAccountModal} onOpen={id => { setTxAccount(id); openPage('transactions'); }} /></TabsContent>
        <TabsContent value="loans"><Loans byType={byType} openAccountModal={openAccountModal} /></TabsContent>
        <TabsContent value="savings"><Savings byType={byType} openAccountModal={openAccountModal} goals={goals} reload={loadAll} /></TabsContent>
        <TabsContent value="transactions"><Transactions key={txAccount || 'all'} initialAccount={txAccount || undefined} transactions={shownTx} allTransactions={transactions} accounts={accounts} plans={plans} view={view} accountName={accountName} reload={loadAll} onEdit={setTxModal} /></TabsContent>
        </>}
      </Tabs>

      {txModal && (
        <TxModal key={txModal === 'new' ? 'new' : txModal.id} accounts={accounts} history={transactions} transaction={txModal === 'new' ? undefined : txModal}
          onClose={() => setTxModal(null)}
          onSaved={async () => { setTxModal(null); toast('Saved'); await loadAll(); }} />
      )}

      {acctModal && (
        <AccountModal type={acctModal.type} account={acctModal.account}
          onClose={() => setAcctModal(null)}
          onSaved={async msg => { setAcctModal(null); toast(msg || 'Saved'); await loadAll(); }} />
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onSaved={value => { applySettings(value); setSettingsOpen(false); toast('Settings saved'); }} onEditCategories={() => { setSettingsOpen(false); setCategoriesOpen(true); }} />}
      {categoriesOpen && <CategoryStylesModal onClose={() => setCategoriesOpen(false)} onSaved={value => { applySettings(value); setCategoriesOpen(false); toast('Categories saved'); }} />}
      {schedulesOpen && <ScheduleManager plans={plans} transactions={transactions} accounts={accounts} view={view} onClose={() => setSchedulesOpen(false)} reload={loadAll} />}
      <Toaster position="bottom-center" offset={{ bottom: 'var(--toast-bottom)' }} mobileOffset={{ bottom: 'var(--toast-bottom)', left: 16, right: 16 }} />
    </div></CategoryContext.Provider></PeopleContext.Provider>
  );
}
