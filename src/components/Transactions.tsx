import { usePeople, useCategoryStyle, CategoryLabel } from '@/lib/household';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CalendarDays, ChevronLeft, ChevronRight, ListFilter, StickyNote } from 'lucide-react';
import { peso, CATEGORIES, INCOME_CATEGORIES, localDate, isAdjustment } from '@/lib/format';
import { api, type Transaction, type Account, type Plan, type View } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import DataImport, { exportTransactions } from '@/components/DataImport';

type AccountName = (id?: string) => string;

type LineProps = { accountName: AccountName; onVoid: (id: string) => void; onEdit: (t: Transaction) => void; onCategory: (c: string) => void };
function TxLine({ t, accountName, onVoid, onEdit, onCategory, hideDate }: { t: Transaction; hideDate?: boolean } & LineProps) {
  const PEOPLE = usePeople(); const style = useCategoryStyle()(t.category);
  const [open, setOpen] = useState(false);
  const who = t.person && PEOPLE[t.person] ? PEOPLE[t.person] + ' · ' : '';
  const [detail, sign, tone] =
    t.type === 'income' ? [t.category ? <><CategoryLabel name={t.category} /> · {accountName(t.to_account_id)}</> : accountName(t.to_account_id), '+', 'text-primary']
    : t.type === 'expense' ? [<><CategoryLabel name={t.category} /> · {accountName(t.from_account_id)}</>, Number(t.amount) < 0 ? '+' : '−', Number(t.amount) < 0 ? 'text-primary' : 'text-foreground']
    : [`${accountName(t.from_account_id)} → ${accountName(t.to_account_id)}`, '', 'text-muted-foreground'];
  const Icon = t.type === 'income' ? ArrowDownLeft : t.type === 'expense' ? ArrowUpRight : ArrowLeftRight;
  return (
    <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] sm:grid-cols-[40px_minmax(0,1fr)_auto] items-start gap-3 border-b p-4 sm:p-5 last:border-none">
      {(t.type === 'expense' || (t.type === 'income' && t.category)) && style.emoji
        ? <span className="flex size-9 sm:size-10 items-center justify-center rounded-xl text-lg" style={{ background: style.color + '26' }} aria-hidden="true">{style.emoji}</span>
        : <span className={cn('flex size-9 sm:size-10 items-center justify-center rounded-xl', t.type === 'income' ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground')}><Icon className="size-[18px]" aria-hidden="true" /></span>}
      <div className="min-w-0">
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="block w-full min-w-0 rounded-md text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"><span className="block text-sm font-semibold break-words">{t.description}</span><span className="block mt-1 text-xs leading-relaxed text-muted-foreground break-words">{who}{detail}</span>{/* Under a day header the date would repeat, so only the Scheduled tag and note marker remain. */}
          {(!hideDate || t.date > localDate() || t.note) && <span className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-muted-foreground">{!hideDate && new Date(t.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}{t.date > localDate() && <span className="rounded-full bg-accent px-2 py-1 text-primary">Scheduled</span>}{t.note && <StickyNote className="size-3.5" aria-label="Has a note" />}</span>}</button>
      </div>
      <div className="flex max-w-[40vw] flex-col items-end gap-1">
        <span className={cn('text-sm font-bold break-all', tone)}>{sign}{peso(Math.abs(Number(t.amount)))}</span>
        <div className="flex flex-wrap justify-end">
          <Button variant="ghost" size="sm" onClick={() => onEdit(t)} aria-label={`Edit ${t.description}`} className="px-2 text-[11px] text-primary">Edit</Button>
          <Button variant="ghost" size="sm" onClick={() => onVoid(t.id)} className="text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive">Void</Button>
        </div>
      </div>
      {open && <div className="col-span-full rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed">{t.note ? <p className="whitespace-pre-wrap break-words">{t.note}</p> : <p className="text-muted-foreground">No note. Use Edit to add one.</p>}
        {t.type !== 'transfer' && <Button variant="link" size="sm" className="mt-1 h-auto p-0 text-xs" onClick={() => onCategory(t.category || 'Other')}>All {t.category || 'Other'} transactions →</Button>}</div>}
    </div>
  );
}

// A card's cutoff dates around today (YYYY-MM-DD), clamped to short months like balances.js.
// Charges on or before `last` are on the current bill; after it they wait for `next`.
function cardCycle(cutoffDay: number, today: string) {
  const [y, m] = today.split('-').map(Number);
  const on = (mi: number) => new Date(y, mi, Math.min(cutoffDay, new Date(y, mi + 1, 0).getDate())).toLocaleDateString('en-CA');
  const lastIdx = on(m - 1) <= today ? m - 1 : m - 2;
  return { prev: on(lastIdx - 1), last: on(lastIdx), next: on(lastIdx + 1) };
}
const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
const charges = (txs: Transaction[], cardId: string) => txs.reduce((n, t) => n + (t.type !== 'income' && t.from_account_id === cardId ? Number(t.amount) : 0), 0);

function TxBlock({ title, note, txs, byDate, ...lineProps }: { title: string; note?: ReactNode; txs: Transaction[]; byDate?: boolean } & LineProps) {
  const [limit, setLimit] = useState(100);
  const shown = txs.slice(0, limit);
  const line = (t: Transaction) => <TxLine key={t.id} t={t} hideDate={byDate} {...lineProps} />;
  // Expenses per day across every matching transaction (refunds are negative, so they reduce it).
  const spent = new Map<string, number>();
  for (const t of txs) if (t.type === 'expense' && !isAdjustment(t)) spent.set(t.date, (spent.get(t.date) || 0) + Number(t.amount));
  const days = [...new Set(shown.map(t => t.date))];
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4"><span className="min-w-0"><span className="block text-sm font-semibold">{title}</span>{note && <span className="mt-0.5 block text-xs text-muted-foreground">{note}</span>}</span><span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">{txs.length} matching</span></div>
      {txs.length
        ? byDate
          ? days.map(day => <section key={day} aria-label={day} className="border-t-2 border-border first-of-type:border-t-0">
              <div className="flex items-center justify-between gap-3 border-b bg-muted px-5 py-2.5 text-[13px]">
                <span className="flex items-center gap-2 font-bold text-foreground"><CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />{new Date(day + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                {spent.has(day) && <span className="text-muted-foreground">Spent <span className="font-semibold text-foreground">{peso(spent.get(day)!)}</span></span>}
              </div>
              {shown.filter(t => t.date === day).map(line)}
            </section>)
          : shown.map(line)
        : <div className="px-6 py-14 text-center"><ListFilter className="size-8 mx-auto mb-3 text-muted-foreground" aria-hidden="true" /><p className="text-sm font-semibold">No matching transactions</p><p className="text-sm text-muted-foreground mt-2">Clear your filters or record a new transaction.</p></div>}
      {txs.length > limit && <div className="p-3 border-t"><Button variant="ghost" className="w-full" onClick={() => setLimit(l => l + 100)}>Show more ({txs.length - limit} left)</Button></div>}
    </Card>
  );
}

function FilterSelect({ id, label, value, onChange, options, disabled }: { id: string; label: string; value: string; onChange: (v: string) => void; options: [string, ReactNode][]; disabled?: boolean }) {
  return <div className="grid min-w-0 gap-2"><Label htmlFor={id}>{label}</Label><Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{options.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div>;
}

export default function Transactions({ initialAccount, initialCategory, initialMonth, transactions, allTransactions, accounts, plans, view, accountName, reload, onEdit }: { initialAccount?: string; initialCategory?: string; initialMonth?: string; transactions: Transaction[]; allTransactions: Transaction[]; accounts: Account[]; plans: Plan[]; view: View; accountName: AccountName; reload: () => Promise<void>; onEdit: (t: Transaction) => void }) {
  const names = usePeople();
  // One month at a time (default: this month, posted only). '' = all months, used when opening a card or a category.
  const thisMonth = localDate().slice(0, 7);
  const openedCard = accounts.find(a => a.id === initialAccount && a.type === 'creditcard');
  const openedCycle = openedCard && cardCycle(Number(openedCard.cutoff_day), localDate());
  const [query, setQuery] = useState(''); const [month, setMonthRaw] = useState(initialMonth || (initialAccount || initialCategory ? '' : thisMonth)); const [account, setAccount] = useState(initialAccount || 'all'); const [category, setCategory] = useState(initialCategory || 'all'); const [person, setPerson] = useState('all'); const [type, setType] = useState('all'); const [timing, setTiming] = useState(openedCycle ? 'all' : 'posted');
  const [importing, setImporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Future months only hold scheduled charges, so they show everything; this month hides what hasn't posted yet.
  const setMonth = (m: string) => { setMonthRaw(m); if (!openedCycle) setTiming(m > thisMonth ? 'all' : 'posted'); };
  const showCategory = (c: string) => { setCategory(c); setMonth(''); window.scrollTo(0, 0); };
  // Month-to-date totals for the header: posted income/expenses this calendar month, in the current view.
  const effectivePerson = view === 'all' ? person : view;
  const categories = [...new Set([...CATEGORIES, ...INCOME_CATEGORIES, ...allTransactions.filter(t => t.type !== 'transfer').map(t => t.category || 'Other')])].sort();
  const accountOptions: [string, string][] = accounts.map(a => [a.id, a.name]);
  for (const id of new Set(allTransactions.flatMap(t => [t.from_account_id, t.to_account_id]).filter(Boolean))) if (!accounts.some(a => a.id === id)) accountOptions.push([id!, 'Archived account · ' + id!.slice(0, 8)]);
  // Everything but the type filter, so both header totals stay visible while one of them is selected.
  const untyped = transactions.filter(t => {
    const text = [t.description, t.category, t.date, t.amount, peso(t.amount), t.person ? names[t.person] : '', accountName(t.from_account_id), accountName(t.to_account_id)].join(' ').toLowerCase();
    return text.includes(query.trim().toLowerCase()) && (!month || t.date.startsWith(month)) && (account === 'all' || t.from_account_id === account || t.to_account_id === account) && (category === 'all' || (t.type !== 'transfer' && (t.category || 'Other') === category)) && (effectivePerson === 'all' || t.person === effectivePerson) && (timing === 'all' || (timing === 'month' ? t.date.slice(0, 7) <= localDate().slice(0, 7) : timing === 'scheduled' ? t.date > localDate() : t.date <= localDate()));
  });
  // Installment charges get their own block: linked to an installment plan, or imported with an "(n/m)" suffix.
  const installmentPlans = new Set(plans.filter(p => p.kind === 'installment').map(p => p.id));
  // A single card picked in the Account filter shows its transactions by billing cycle instead.
  const card = accounts.find(a => a.id === account && a.type === 'creditcard');
  const lineProps = { accountName, onVoid: (id: string) => handleVoid(id), onEdit, onCategory: showCategory };
  // Header totals follow every filter, so a category view shows what that category cost.
  const filtered = untyped.filter(t => type === 'all' || t.type === type);
  const total = (kind: string) => untyped.filter(t => t.type === kind && !isAdjustment(t)).reduce((s, t) => s + Number(t.amount), 0);
  const monthName = (m: string) => new Date(m + '-01T00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const step = (n: number) => { const [y, m] = (month || thisMonth).split('-').map(Number); setMonth(new Date(y, m - 1 + n, 1).toLocaleDateString('en-CA').slice(0, 7)); };
  const isInstallment = (t: Transaction) => installmentPlans.has(t.plan_id!) || /\(\d+\s*\/\s*\d+\)\s*$/.test(t.description);
  // Void asks first: it can't be undone from the app.
  const [voiding, setVoiding] = useState<Transaction | null>(null);
  const handleVoid = (id: string) => setVoiding(transactions.find(t => t.id === id) || null);
  async function confirmVoid(id: string) {
    try {
      await api.voidTransaction(id);
      toast('Transaction voided');
      await reload();
    } catch (err) {
      toast.error('Failed: ' + (err as Error).message);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap justify-between gap-4"><div><h2 className="text-3xl font-bold tracking-tight">Transactions</h2><p className="text-sm text-muted-foreground mt-2">Search, review, and manage your ledger.</p></div><div className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={() => setImporting(true)}>Import CSV</Button><Button variant="outline" disabled={!filtered.length} onClick={() => exportTransactions(filtered, accounts, names)}>Export filtered CSV</Button></div></div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" aria-label="Previous month" disabled={!month} onClick={() => step(-1)}><ChevronLeft aria-hidden="true" /></Button>
        <div className="min-w-0 text-center"><p className="truncate text-lg font-semibold" aria-live="polite">{month ? monthName(month) : 'All months'}</p>
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setMonth(month ? '' : thisMonth)}>{month ? 'Show all months' : 'Back to this month'}</Button></div>
        <Button variant="outline" size="icon" aria-label="Next month" disabled={!month} onClick={() => step(1)}><ChevronRight aria-hidden="true" /></Button>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-5">
        {([['expense', 'Expenses', 'text-destructive'], ['income', 'Income', 'text-primary']] as const).map(([kind, label, tone]) => <button key={kind} type="button" aria-pressed={type === kind} onClick={() => setType(type === kind ? 'all' : kind)}
          className={cn('min-w-0 rounded-2xl border bg-card p-4 text-left shadow-[0_2px_8px_rgba(24,46,36,0.025)] transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5', type === kind && 'border-primary ring-1 ring-primary')}>
          {/* Toggles the type filter: click once to show only this type, again to show everything. */}
          <span className="block truncate text-xs sm:text-sm text-muted-foreground">{label}{category !== 'all' && ` · ${category}`}{type === kind && ' · showing only'}</span>
          <span className={cn('mt-1 block text-xl sm:text-2xl font-bold tabular-nums', tone)}>{peso(total(kind))}</span>
        </button>)}
      </div>
      <Card className="p-4 sm:p-5 mb-5 space-y-4">
        <div className="grid gap-2"><Label htmlFor="tx-search">Search transactions</Label><Input id="tx-search" type="search" placeholder="Description, amount, account, category…" value={query} onChange={e => setQuery(e.target.value)} /></div>
        <Button type="button" variant="outline" className="w-full justify-between" aria-expanded={filtersOpen} aria-controls="tx-filters" onClick={() => setFiltersOpen(o => !o)}>
          <span className="flex items-center gap-2"><ListFilter className="size-4" aria-hidden="true" />{filtersOpen ? 'Hide filters' : 'Filters'}</span>
          <span className="text-xs font-normal text-muted-foreground">{[accountOptions.find(([id]) => id === account)?.[1], category !== 'all' && category, type !== 'all' && type, timing !== 'all' && timing].filter(Boolean).join(' · ')}</span>
        </Button>
        <div id="tx-filters" className={cn('gap-4 sm:grid-cols-2 lg:grid-cols-4', filtersOpen ? 'grid' : 'hidden')}>
          <FilterSelect id="tx-account" label="Account" value={account} onChange={setAccount} options={[["all", "All accounts"], ...accountOptions]} />
          <FilterSelect id="tx-category" label="Category" value={category} onChange={setCategory} options={[["all", "All categories"], ...categories.map(c => [c, <CategoryLabel name={c} />] as [string, ReactNode])]} />
          <FilterSelect id="tx-person" label="Person" value={effectivePerson} onChange={setPerson} disabled={view !== 'all'} options={[["all", "All people"], ...Object.entries(names)]} />
          <FilterSelect id="tx-type" label="Transaction type" value={type} onChange={setType} options={[["all", "All types"], ["income", "Income"], ["expense", "Expense"], ["transfer", "Transfer"]]} />
          <FilterSelect id="tx-timing" label="Timing" value={timing} onChange={setTiming} options={[["month", "Through this month"], ["all", "All dates"], ["posted", "Posted"], ["scheduled", "Scheduled"]]} />
          <Button variant="ghost" className="self-end" onClick={() => { setQuery(''); setAccount('all'); setCategory('all'); setPerson('all'); setType('all'); setTiming(month > thisMonth ? 'all' : 'posted'); }}>Reset filters</Button>
        </div>
      </Card>
      <div className="space-y-5">
        {card ? (() => {
          const c = cardCycle(Number(card.cutoff_day), localDate()), today = localDate();
          // Statement order: what's due now, then what's building up, then what's scheduled.
          const sections: [string, ReactNode, (d: string) => boolean][] = [
            ['Current bill', `Closed ${shortDate(c.last)}${card.dueDate ? ` · due ${shortDate(card.dueDate)}` : ''}`, d => d > c.prev && d <= c.last],
            ['Since cutoff · not billed yet', `Made after the ${shortDate(c.last)} cutoff; bills on ${shortDate(c.next)}`, d => d > c.last && d <= today],
            ['Scheduled before next cutoff', `Bills on ${shortDate(c.next)}`, d => d > today && d <= c.next],
            ['Scheduled for later', `After the ${shortDate(c.next)} cutoff`, d => d > c.next],
            ['Earlier statements', `On or before the ${shortDate(c.prev)} cutoff`, d => d <= c.prev],
          ];
          const blocks = sections.map(([title, note, inRange]) => [title, note, filtered.filter(t => inRange(t.date))] as const).filter(([, , txs]) => txs.length);
          return blocks.length
            ? blocks.map(([title, note, txs]) => <TxBlock key={title} byDate title={title} note={<>{note} · Charges {peso(charges(txs, card.id))}</>} txs={txs} {...lineProps} />)
            : <TxBlock title={card.name} txs={[]} {...lineProps} />;
        })() : <>
        <TxBlock title="All activity" byDate txs={filtered.filter(t => !isInstallment(t))} {...lineProps} />
        <TxBlock title="Installments" txs={filtered.filter(isInstallment)} {...lineProps} />
        </>}
      </div>
      <AlertDialog open={!!voiding} onOpenChange={o => !o && setVoiding(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this transaction?</AlertDialogTitle>
            <AlertDialogDescription>{voiding && <>{voiding.description} · {peso(Math.abs(Number(voiding.amount)))} · {shortDate(voiding.date)}. It will be removed from your balances and can't be restored from the app.</>}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => voiding && confirmVoid(voiding.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Void</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {importing && <DataImport accounts={accounts} defaultPerson={view === 'all' ? undefined : view} onClose={() => setImporting(false)} onSaved={async message => { setImporting(false); toast(message); await reload(); }} />}
    </div>
  );
}
