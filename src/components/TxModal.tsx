import { useState, type FormEvent } from 'react';
import { api, type Account, type NewTransaction, type Person, type TxType } from '@/lib/api';
import { CATEGORIES, PEOPLE, localDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

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

export default function TxModal({ accounts, onClose, onSaved }: { accounts: Account[]; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<TxType>('income');
  const [date, setDate] = useState(localDate());
  const [person, setPerson] = useState<Person | ''>(lastPerson());
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const savings = accounts.filter(a => a.type === 'savings');
  const cards = accounts.filter(a => a.type === 'creditcard');
  const loans = accounts.filter(a => a.type === 'loan');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!person) { setError('Choose who this is for.'); return; }
    try { localStorage.setItem(LAST_PERSON, person); } catch { /* storage blocked */ }
    const payload: NewTransaction = { type, date, person, amount: parseFloat(amount), description: description.trim() };
    if (type === 'income') {
      payload.to_account_id = toAccount;
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
      await api.createTransaction(payload);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="bg-card max-w-[440px]">
        <DialogHeader><DialogTitle className="font-display text-xl">Record transaction</DialogTitle></DialogHeader>

        <ToggleGroup type="single" variant="outline" value={type} onValueChange={v => v && setType(v as TxType)} className="grid grid-cols-3">
          {(['income', 'expense', 'transfer'] as const).map(t => (
            <ToggleGroupItem key={t} value={t} className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              {t[0].toUpperCase() + t.slice(1)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Who</Label>
            <ToggleGroup type="single" variant="outline" value={person} onValueChange={v => v && setPerson(v as Person)} className="grid grid-cols-2">
              {(Object.entries(PEOPLE) as [Person, string][]).map(([id, name]) => (
                <ToggleGroupItem key={id} value={id} className="data-[state=on]:bg-foreground data-[state=on]:text-background">{name}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="date">Date</Label><Input id="date" type="date" required value={date} onChange={e => setDate(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="amount">Amount (₱)</Label><Input id="amount" inputMode="decimal" type="number" step="0.01" min="0.01" required placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="desc">Description</Label><Input id="desc" required placeholder="e.g. Salary, Grocery run, Card payment" value={description} onChange={e => setDescription(e.target.value)} /></div>

          {type === 'income' && <AccountSelect id="to" label="Deposit into" value={toAccount} onChange={setToAccount} groups={[['Savings', savings]]} />}

          {type === 'expense' && (
            <>
              <AccountSelect id="from" label="Charge to" value={fromAccount} onChange={setFromAccount} groups={[['Savings', savings], ['Credit card', cards]]} />
              <div className="grid gap-1.5">
                <Label htmlFor="category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </>
          )}

          {type === 'transfer' && (
            <>
              <AccountSelect id="from" label="From (savings)" value={fromAccount} onChange={setFromAccount} groups={[['Savings', savings]]} />
              <AccountSelect id="to" label="To" value={toAccount} onChange={setToAccount} groups={[['Savings', savings], ['Credit card', cards], ['Loan', loans]]} />
            </>
          )}

          {error && <div className="text-destructive text-xs">{error}</div>}

          <Button type="submit" disabled={saving} className="w-full mt-1">{saving ? 'Saving…' : 'Save'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
