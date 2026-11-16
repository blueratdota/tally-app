import { usePeople, CategoryLabel } from '@/lib/household';
import { useState, type FormEvent } from 'react';
import { api, type Account, type NewTransaction, type Person, type TxType, type Transaction, type Frequency } from '@/lib/api';
import { CATEGORIES, INCOME_CATEGORIES, localDate, peso, FREQUENCIES } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Toggle } from '@/components/ui/toggle';

const LAST_PERSON = 'tally-person';
const lastPerson = () => { try { return (localStorage.getItem(LAST_PERSON) || '') as Person | ''; } catch { return ''; } };

type Group = [label: string, accounts: Account[]];

// Account picker; groups get a heading only when there's more than one kind.
function AccountSelect({ id, label, value, onChange, groups }: { id: string; label: string; value: string; onChange: (v: string) => void; groups: Group[] }) {
  const nonEmpty = groups.filter(([, list]) => list.length);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select name={id} required value={value} onValueChange={onChange}>
        <SelectTrigger id={id}><SelectValue placeholder={nonEmpty.length ? 'Select account' : 'No accounts yet — add one first'} /></SelectTrigger>
        <SelectContent>
          {value && !nonEmpty.some(([, list]) => list.some(a => a.id === value)) && <SelectItem value={value}>Archived account (unchanged)</SelectItem>}
          {nonEmpty.map(([g, list]) => (
            <SelectGroup key={g}>
              {groups.length > 1 && <SelectLabel>{g}</SelectLabel>}
              {list.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function TxModal({ accounts, history, transaction, onClose, onSaved }: { accounts: Account[]; history: Transaction[]; transaction?: Transaction; onClose: () => void; onSaved: () => void }) {
  const PEOPLE = usePeople();
  const [type, setType] = useState<TxType>(transaction?.type || 'expense');
  const [installment, setInstallment] = useState(false);
  const isInstallment = type === 'expense' && installment;
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [endDate, setEndDate] = useState('');
  const [months, setMonths] = useState('12');
  const [date, setDate] = useState(transaction?.date || localDate());
  const [person, setPerson] = useState<Person | ''>(transaction ? transaction.person || '' : lastPerson());
  const [amount, setAmount] = useState(String(transaction?.amount ?? ''));
  const [description, setDescription] = useState(transaction?.description || '');
  const [note, setNote] = useState(transaction?.note || '');
  const [category, setCategory] = useState(transaction ? transaction.category || (transaction.type === 'income' ? 'Other income' : 'Other') : 'Groceries');
  const categoryList = type === 'income' ? INCOME_CATEGORIES : CATEGORIES;
  const [fromAccount, setFromAccount] = useState(transaction?.from_account_id || '');
  const [toAccount, setToAccount] = useState(transaction?.to_account_id || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Past descriptions for this type, newest first, without installment counters like "(3/24)".
  // Each past description -> the category it was last used with (history is newest first, so first seen wins).
  const lastCategory = new Map<string, string>();
  for (const t of history) {
    if (t.type !== type) continue;
    const d = t.description.replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/, '').trim();
    if (d && !lastCategory.has(d)) lastCategory.set(d, t.category || '');
  }
  // Inline completion: the newest past description that starts with what's typed, shown in gray after the cursor.
  const typed = description.trimStart();
  const completion = typed && [...lastCategory.keys()].find(d => d.length > typed.length && d.toLowerCase().startsWith(typed.toLowerCase()));
  const pickDescription = (value: string) => {
    setDescription(value);
    const c = lastCategory.get(value.trim());
    if (c && type !== 'transfer') setCategory(c);
  };
  const savings = accounts.filter(a => a.type === 'savings');
  const cards = accounts.filter(a => a.type === 'creditcard');
  const loans = accounts.filter(a => a.type === 'loan');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!person) { setError('Choose who this is for.'); return; }
    try { localStorage.setItem(LAST_PERSON, person); } catch { /* storage blocked */ }
    const payload: NewTransaction = { type, date, person, amount: parseFloat(amount), description: description.trim(), note: note.trim() };
    if (isInstallment) payload.installments = Number(months);
    if (type === 'expense' && recurring && !transaction) payload.recurring = { frequency, end_date: endDate };
    if (type === 'income') {
      payload.to_account_id = toAccount;
      payload.category = category;
    } else if (type === 'expense') {
      payload.from_account_id = fromAccount;
      payload.category = category;
    } else {
      payload.from_account_id = fromAccount;
      payload.to_account_id = toAccount;
      if (fromAccount && fromAccount === toAccount) {
        setError("Source and destination can't be the same account.");
        return;
      }
    }

    setSaving(true);
    try {
      if (transaction) await api.updateTransaction(transaction, payload);
      else await api.createTransaction(payload);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="bg-card max-w-[520px]">
        <DialogHeader><DialogTitle className="font-display text-2xl tracking-tight">{transaction ? 'Edit transaction' : 'Record transaction'}</DialogTitle></DialogHeader>

        {transaction && <p className="text-xs text-muted-foreground">Only this transaction will change. Its previous version stays in your ledger for audit history.</p>}
        <ToggleGroup type="single" variant="outline" value={type} onValueChange={v => { if (v) { setType(v as TxType); if (v === 'transfer' && !description.trim()) setDescription('Transfer'); else if (v !== 'transfer' && description === 'Transfer') setDescription(''); setCategory(v === 'income' ? 'Salary' : 'Groceries'); setInstallment(false); setRecurring(false); setFromAccount(''); setToAccount(''); setError(''); } }} aria-label="Transaction type" className="grid grid-cols-3 rounded-2xl bg-muted p-1">
          {(['income', 'expense', 'transfer'] as const).map(t => (
            <ToggleGroupItem key={t} value={t} disabled={!!transaction?.plan_id && t !== 'expense'} className="rounded-xl border-0 shadow-none data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              {t[0].toUpperCase() + t.slice(1)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <form onSubmit={handleSubmit} className="grid min-w-0 gap-4">
          {type === 'expense' && !transaction && (
            <Toggle variant="outline" pressed={installment} onPressedChange={v => {
              setInstallment(v);
              if (v) setRecurring(false);
              if (v && !cards.some(a => a.id === fromAccount)) setFromAccount('');
              setError('');
            }} className="group h-12 w-full justify-between rounded-xl bg-muted/50 px-3">
              <span>Pay in installments</span>
              <span aria-hidden="true" className="relative h-6 w-10 shrink-0 rounded-full bg-muted-foreground/30 group-data-[state=on]:bg-primary">
                <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform group-data-[state=on]:translate-x-4" />
              </span>
            </Toggle>
          )}
          {type === 'expense' && !transaction && <Toggle variant="outline" pressed={recurring} onPressedChange={v => { setRecurring(v); if (v) setInstallment(false); }} className="group h-12 w-full justify-between rounded-xl bg-muted/50 px-3">
            <span>Repeat this expense</span><span aria-hidden="true" className="relative h-6 w-10 shrink-0 rounded-full bg-muted-foreground/30 group-data-[state=on]:bg-primary"><span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform group-data-[state=on]:translate-x-4" /></span>
          </Toggle>}
          <div className="grid gap-1.5">
            <Label id="tx-who">Who</Label>
            <ToggleGroup type="single" variant="outline" aria-labelledby="tx-who" value={person} onValueChange={v => v && setPerson(v as Person)} className="grid grid-cols-2 rounded-2xl bg-muted p-1">
              {(Object.entries(PEOPLE) as [Person, string][]).map(([id, name]) => (
                <ToggleGroupItem key={id} value={id} className="rounded-xl border-0 shadow-none data-[state=on]:bg-foreground data-[state=on]:text-background"><span className="truncate">{name}</span></ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="grid min-w-0 gap-1.5"><Label htmlFor="date">{isInstallment || recurring ? 'First charge date' : 'Date'}</Label><Input id="date" type="date" required value={date} onChange={e => setDate(e.target.value)} /></div>
            <div className="grid min-w-0 gap-1.5"><Label htmlFor="amount">{isInstallment ? 'Total amount (₱)' : recurring ? 'Amount per charge (₱)' : 'Amount (₱)'}</Label><Input id="amount" inputMode="decimal" type="number" step="0.01" min={type === 'expense' && !isInstallment && !recurring ? undefined : '0.01'} required placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          </div>
          {recurring && <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="frequency">Frequency</Label><Select value={frequency} onValueChange={v => setFrequency(v as Frequency)}><SelectTrigger id="frequency"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(FREQUENCIES).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-1.5"><Label htmlFor="end-date">End date (optional)</Label><Input id="end-date" type="date" min={date} value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground sm:col-span-2">Due entries are recorded when the app refreshes, including missed charges. Manage or stop the schedule under Manage schedules.</p>
          </div>}
          {isInstallment && (
            <div className="grid gap-1.5">
              <Label htmlFor="months">Number of monthly charges</Label>
              <Input id="months" type="number" inputMode="numeric" min="2" max="120" step="1" required value={months} onChange={e => setMonths(e.target.value)} aria-describedby="installment-note" />
              <p id="installment-note" className="text-xs text-muted-foreground">
                {Number(amount) > 0 && Number(months) >= 2 && Number.isInteger(Number(months))
                  ? `About ${peso(Number(amount) / Number(months))} per month. The final charge adjusts for rounding. ` : ''}
                Enter the full total including any interest or fees. Future charges appear under upcoming installments.
              </p>
            </div>
          )}
          <div className="grid gap-1.5"><Label htmlFor="desc">Description</Label>
            <div className="relative">
              <Input id="desc" required autoComplete="off" aria-describedby={completion ? 'desc-hint' : undefined} placeholder="e.g. Salary, Grocery run, Card payment" value={description}
                onChange={e => pickDescription(e.target.value)}
                onKeyDown={e => {
                  const atEnd = e.currentTarget.selectionStart === description.length;
                  if (completion && (e.key === 'Tab' || (e.key === 'ArrowRight' && atEnd))) { e.preventDefault(); pickDescription(completion); }
                }} />
              {/* ponytail: gray text lines up only while the typed text fits the field; long text just scrolls under it. */}
              {completion && <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre px-[15px] text-base md:text-sm">
                <span className="invisible">{description}</span>
                <span className="pointer-events-auto cursor-pointer text-muted-foreground" onMouseDown={e => { e.preventDefault(); pickDescription(completion); }}>{completion.slice(typed.length)}</span>
              </div>}
            </div>
            {completion && <p id="desc-hint" className="sr-only">Suggestion: {completion}. Press Tab to use it.</p>}
          </div>

          {type === 'income' && <AccountSelect id="to" label="Deposit into" value={toAccount} onChange={setToAccount} groups={[['Savings', savings]]} />}

          {type === 'expense' && <AccountSelect id="from" label="Charge to" value={fromAccount} onChange={setFromAccount} groups={isInstallment ? [['Credit card', cards]] : [['Savings', savings], ['Credit card', cards]]} />}

          {type !== 'transfer' && (
            <div className="grid gap-1.5">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category"><SelectValue /></SelectTrigger>
                <SelectContent>{(categoryList.includes(category) ? categoryList : [category, ...categoryList]).map(c => <SelectItem key={c} value={c}><CategoryLabel name={c} /></SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          {type === 'transfer' && (
            <>
              <AccountSelect id="from" label="From" value={fromAccount} onChange={v => { setFromAccount(v); if (cards.some(a => a.id === v) && !loans.some(a => a.id === toAccount)) setToAccount(''); }} groups={[['Savings', savings], ['Credit card (loan payments only)', cards]]} />
              <AccountSelect id="to" label="To" value={toAccount} onChange={setToAccount} groups={cards.some(a => a.id === fromAccount) ? [['Loan', loans]] : [['Savings', savings], ['Credit card', cards], ['Loan', loans]]} />
            </>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="note">Note (optional)</Label>
            <textarea id="note" rows={3} maxLength={1000} placeholder="Anything worth remembering about this" value={note} onChange={e => setNote(e.target.value)}
              className="block min-h-20 w-full resize-y rounded-xl border border-input bg-muted/50 px-3.5 py-2.5 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm" />
          </div>

          {error && <div role="alert" className="text-destructive text-sm">{error}</div>}

          <Button type="submit" disabled={saving} className="w-full mt-1">{saving ? 'Saving…' : transaction ? 'Save changes' : isInstallment ? 'Schedule installments' : recurring ? 'Save recurring expense' : 'Save'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
