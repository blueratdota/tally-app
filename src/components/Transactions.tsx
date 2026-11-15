import { usePeople } from '@/lib/household';
import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, ListFilter } from 'lucide-react';
import { peso, CATEGORIES, localDate } from '@/lib/format';
import { api, type Transaction, type Account, type View } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DataImport, { exportTransactions } from '@/components/DataImport';

type AccountName = (id?: string) => string;

function TxLine({ t, accountName, onVoid, onEdit }: { t: Transaction; accountName: AccountName; onVoid: (id: string) => void; onEdit: (t: Transaction) => void }) {
  const PEOPLE = usePeople();
  const who = t.person && PEOPLE[t.person] ? PEOPLE[t.person] + ' · ' : '';
  const [detail, sign, tone] =
    t.type === 'income' ? [accountName(t.to_account_id), '+', 'text-primary']
    : t.type === 'expense' ? [`${t.category || 'Other'} · ${accountName(t.from_account_id)}`, Number(t.amount) < 0 ? '+' : '−', Number(t.amount) < 0 ? 'text-primary' : 'text-foreground']
    : [`${accountName(t.from_account_id)} → ${accountName(t.to_account_id)}`, '', 'text-muted-foreground'];
  const Icon = t.type === 'income' ? ArrowDownLeft : t.type === 'expense' ? ArrowUpRight : ArrowLeftRight;
  return (
    <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] sm:grid-cols-[40px_minmax(0,1fr)_auto] items-start gap-3 border-b p-4 sm:p-5 last:border-none">
      <span className={cn('flex size-9 sm:size-10 items-center justify-center rounded-xl', t.type === 'income' ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground')}><Icon className="size-[18px]" aria-hidden="true" /></span>
      <div className="min-w-0"><p className="text-sm font-semibold break-words">{t.description}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground break-words">{who}{detail}</p><p className="mt-2 text-[11px] text-muted-foreground">{new Date(t.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}{t.date > localDate() && <span className="ml-2 rounded-full bg-accent px-2 py-1 text-primary">Scheduled</span>}</p></div>
      <div className="flex max-w-[40vw] flex-col items-end gap-1">
        <span className={cn('text-sm font-bold break-all', tone)}>{sign}{peso(Math.abs(Number(t.amount)))}</span>
        <div className="flex flex-wrap justify-end">
          <Button variant="ghost" size="sm" onClick={() => onEdit(t)} aria-label={`Edit ${t.description}`} className="px-2 text-[11px] text-primary">Edit</Button>
          <Button variant="ghost" size="sm" onClick={() => onVoid(t.id)} className="text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive">Void</Button>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ id, label, value, onChange, options, disabled }: { id: string; label: string; value: string; onChange: (v: string) => void; options: [string, string][]; disabled?: boolean }) {
  return <div className="grid min-w-0 gap-2"><Label htmlFor={id}>{label}</Label><Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{options.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div>;
}

export default function Transactions({ transactions, allTransactions, accounts, view, accountName, reload, onEdit }: { transactions: Transaction[]; allTransactions: Transaction[]; accounts: Account[]; view: View; accountName: AccountName; reload: () => Promise<void>; onEdit: (t: Transaction) => void }) {
  const names = usePeople();
  const [query, setQuery] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [account, setAccount] = useState('all'); const [category, setCategory] = useState('all'); const [person, setPerson] = useState('all'); const [type, setType] = useState('all'); const [timing, setTiming] = useState('all');
  const [importing, setImporting] = useState(false);
  const effectivePerson = view === 'all' ? person : view;
  const categories = [...new Set([...CATEGORIES, ...allTransactions.filter(t => t.type === 'expense').map(t => t.category || 'Other')])].sort();
  const accountOptions: [string, string][] = accounts.map(a => [a.id, a.name]);
  for (const id of new Set(allTransactions.flatMap(t => [t.from_account_id, t.to_account_id]).filter(Boolean))) if (!accounts.some(a => a.id === id)) accountOptions.push([id!, 'Archived account · ' + id!.slice(0, 8)]);
  const filtered = transactions.filter(t => {
    const text = [t.description, t.category, t.date, t.amount, peso(t.amount), t.person ? names[t.person] : '', accountName(t.from_account_id), accountName(t.to_account_id)].join(' ').toLowerCase();
    return text.includes(query.trim().toLowerCase()) && (!from || t.date >= from) && (!to || t.date <= to) && (account === 'all' || t.from_account_id === account || t.to_account_id === account) && (category === 'all' || (t.type === 'expense' && (t.category || 'Other') === category)) && (effectivePerson === 'all' || t.person === effectivePerson) && (type === 'all' || t.type === type) && (timing === 'all' || (timing === 'scheduled' ? t.date > localDate() : t.date <= localDate()));
  });
  const [limit, setLimit] = useState(100);
  async function handleVoid(id: string) {
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
      <Card className="p-4 sm:p-5 mb-5 space-y-4">
        <div className="grid gap-2"><Label htmlFor="tx-search">Search transactions</Label><Input id="tx-search" type="search" placeholder="Description, amount, account, category…" value={query} onChange={e => setQuery(e.target.value)} /></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid min-w-0 gap-2"><Label htmlFor="tx-from">From date</Label><Input id="tx-from" type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></div>
          <div className="grid min-w-0 gap-2"><Label htmlFor="tx-to">To date</Label><Input id="tx-to" type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></div>
          <FilterSelect id="tx-account" label="Account" value={account} onChange={setAccount} options={[["all", "All accounts"], ...accountOptions]} />
          <FilterSelect id="tx-category" label="Category" value={category} onChange={setCategory} options={[["all", "All categories"], ...categories.map(c => [c, c] as [string, string])]} />
          <FilterSelect id="tx-person" label="Person" value={effectivePerson} onChange={setPerson} disabled={view !== 'all'} options={[["all", "All people"], ...Object.entries(names)]} />
          <FilterSelect id="tx-type" label="Transaction type" value={type} onChange={setType} options={[["all", "All types"], ["income", "Income"], ["expense", "Expense"], ["transfer", "Transfer"]]} />
          <FilterSelect id="tx-timing" label="Timing" value={timing} onChange={setTiming} options={[["all", "All dates"], ["posted", "Posted"], ["scheduled", "Scheduled"]]} />
          <Button variant="ghost" className="self-end" onClick={() => { setQuery(''); setFrom(''); setTo(''); setAccount('all'); setCategory('all'); setPerson('all'); setType('all'); setTiming('all'); }}>Clear filters</Button>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4"><span className="text-sm font-semibold">All activity</span><span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">{filtered.length} matching</span></div>
        {filtered.length
          ? filtered.slice(0, limit).map(t => <TxLine key={t.id} t={t} accountName={accountName} onVoid={handleVoid} onEdit={onEdit} />)
          : <div className="px-6 py-14 text-center"><ListFilter className="size-8 mx-auto mb-3 text-muted-foreground" aria-hidden="true" /><p className="text-sm font-semibold">No matching transactions</p><p className="text-sm text-muted-foreground mt-2">Clear your filters or record a new transaction.</p></div>}
        {filtered.length > limit && <div className="p-3 border-t"><Button variant="ghost" className="w-full" onClick={() => setLimit(l => l + 100)}>Show more ({filtered.length - limit} left)</Button></div>}
      </Card>
      {importing && <DataImport accounts={accounts} defaultPerson={view === 'all' ? undefined : view} onClose={() => setImporting(false)} onSaved={async message => { setImporting(false); toast(message); await reload(); }} />}
    </div>
  );
}
