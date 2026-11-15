import { useState, type FormEvent } from 'react';
import { api, type Account, type Plan, type Transaction, type View, type Frequency } from '@/lib/api';
import { usePeople } from '@/lib/household';
import { FREQUENCIES, localDate, peso } from '@/lib/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';

const linked = (p: Plan, t: Transaction) => t.plan_id === p.id || !!p.legacy_ids?.split(',').includes(t.id);
const tomorrow = () => { const d = new Date(localDate() + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA'); };

export default function ScheduleManager({ plans, transactions, accounts, view, onClose, reload }: { plans: Plan[]; transactions: Transaction[]; accounts: Account[]; view: View; onClose: () => void; reload: () => Promise<void> }) {
  const names = usePeople();
  const [editing, setEditing] = useState<Plan | null>(null);
  const [amount, setAmount] = useState(''); const [count, setCount] = useState(''); const [date, setDate] = useState(''); const [frequency, setFrequency] = useState<Frequency>('monthly'); const [end, setEnd] = useState('');
  const [linking, setLinking] = useState(false); const [selected, setSelected] = useState<string[]>([]); const [name, setName] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const today = localDate();
  const visible = plans.filter(p => view === 'all' || p.person === view);
  const future = (plan: Plan) => transactions.filter(t => t.type === 'expense' && linked(plan, t) && t.date > today).sort((a, b) => a.date.localeCompare(b.date));
  const legacy = transactions.filter(t => t.type === 'expense' && !t.plan_id && (t.date > today || /\(\d+\s*\/\s*\d+\)\s*$/.test(t.description)) && !plans.some(p => linked(p, t)) && (view === 'all' || t.person === view) && accounts.some(a => a.id === t.from_account_id && a.type === 'creditcard'));
  function edit(plan: Plan) {
    const rows = future(plan); setEditing(plan); setAmount(String(rows[0]?.amount ?? plan.amount)); setCount(String(rows.length || 1)); setDate(rows[0]?.date || plan.next_date || tomorrow()); setFrequency(plan.frequency); setEnd(plan.end_date || ''); setError('');
  }
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.updatePlan(editing!, { amount: Number(amount), next_date: date, remaining_count: Number(count), frequency, end_date: end }); setEditing(null); await reload(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function stop(plan: Plan) {
    setBusy(true); setError('');
    try { await api.stopPlan(plan.id); await reload(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function link(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.linkInstallments(selected, name); setLinking(false); setSelected([]); await reload(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={o => !o && onClose()}><DialogContent className="bg-card max-w-3xl"><DialogHeader><DialogTitle>{editing ? 'Change future charges' : linking ? 'Link existing installments' : 'Manage schedules'}</DialogTitle></DialogHeader>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {editing ? <form onSubmit={save} className="grid gap-4">
      <p className="text-sm font-semibold break-words">{editing.description}</p><p className="text-xs text-muted-foreground">Posted entries and individual past edits stay intact. These changes apply only to future charges.</p>
      <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="plan-amount">Amount per charge (₱)</Label><Input id="plan-amount" required type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div><div className="grid gap-2"><Label htmlFor="plan-next">Next charge date</Label><Input id="plan-next" required type="date" min={tomorrow()} value={date} onChange={e => setDate(e.target.value)} /></div></div>
      {editing.kind === 'installment' ? <><div className="grid gap-2"><Label htmlFor="plan-count">Remaining monthly charges</Label><Input id="plan-count" required type="number" min="1" max="120" value={count} onChange={e => setCount(e.target.value)} /></div><p className="text-sm text-muted-foreground">New remaining total: {peso(Number(amount) * Number(count))}</p></> : <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="plan-frequency">Frequency</Label><Select value={frequency} onValueChange={v => setFrequency(v as Frequency)}><SelectTrigger id="plan-frequency"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(FREQUENCIES).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="plan-end">End date (optional)</Label><Input id="plan-end" type="date" min={date} value={end} onChange={e => setEnd(e.target.value)} /></div></div>}
      <div className="flex flex-wrap gap-2"><Button disabled={busy}>{busy ? 'Saving…' : 'Save future charges'}</Button><Button variant="ghost" type="button" onClick={() => setEditing(null)}>Back</Button></div>
    </form> : linking ? <form onSubmit={link} className="grid gap-4">
      <p className="text-xs text-muted-foreground">Review and select entries that belong to one plan, on one card, for one person. Linking does not change amounts or dates.</p>
      <div className="grid gap-2"><Label htmlFor="link-name">Plan name</Label><Input id="link-name" required value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="max-h-72 overflow-y-auto divide-y rounded-xl border">{legacy.map(t => <label key={t.id} className="flex min-h-12 items-start gap-3 p-3 text-sm"><input className="mt-1 size-5 shrink-0 accent-primary" type="checkbox" checked={selected.includes(t.id)} onChange={e => { setSelected(e.target.checked ? [...selected, t.id] : selected.filter(id => id !== t.id)); if (!name) setName(t.description.replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/, '')); }} /><span className="min-w-0 break-words">{t.description}<span className="block text-xs text-muted-foreground">{t.date} · {peso(t.amount)} · {t.person ? names[t.person] : 'No person'} · {accounts.find(a => a.id === t.from_account_id)?.name}</span></span></label>)}</div>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !selected.length}>{busy ? 'Linking…' : 'Link selected entries'}</Button><Button type="button" variant="ghost" onClick={() => setLinking(false)}>Back</Button></div>
    </form> : <>
      <p className="text-xs text-muted-foreground">Subscriptions and other recurring expenses catch up when the app refreshes. Installment balances below show future charges, separate from already-posted card debt.</p>
      {!!legacy.length && <Button variant="outline" onClick={() => { setLinking(true); setError(''); }}>Link existing installment entries</Button>}
      {!visible.length && <p className="py-6 text-sm text-muted-foreground">No schedules yet. Turn on Repeat this expense or Pay in installments when recording an expense.</p>}
      <div className="grid gap-4 sm:grid-cols-2">{visible.map(plan => {
        const rows = future(plan), total = rows.reduce((n, t) => n + Number(t.amount), 0), last = rows.at(-1)?.date;
        const next = plan.kind === 'recurring' ? plan.next_date : rows[0]?.date;
        const account = accounts.find(a => a.id === plan.account_id);
        return <Card key={plan.id} className="p-5 space-y-3"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 font-semibold break-words">{plan.description}</h3><span className="rounded-full bg-muted px-2 py-1 text-[10px]">{!plan.active ? 'Stopped' : !account ? 'Account archived' : next ? plan.kind === 'recurring' ? 'Recurring' : 'Installment' : 'Complete'}</span></div>
          <p className="text-xs text-muted-foreground break-words">{account?.name || 'Archived account'} · {names[plan.person]}</p>
          <p className="font-bold break-all">{peso(rows[0]?.amount ?? plan.amount)} <span className="text-xs font-normal text-muted-foreground">{FREQUENCIES[plan.frequency]}</span></p>
          {plan.kind === 'installment' ? <dl className="space-y-2 text-xs"><div className="flex justify-between gap-2"><dt>Future charges</dt><dd>{rows.length}</dd></div><div className="flex flex-wrap justify-between gap-2"><dt>Remaining total</dt><dd className="font-semibold">{peso(total)}</dd></div><div className="flex justify-between gap-2"><dt>Finish date</dt><dd>{last || 'No future charges'}</dd></div></dl> : <p className="text-xs text-muted-foreground">Next: {next || 'No future entries'}{plan.end_date && ` · Ends ${plan.end_date}`}</p>}
          {plan.active && account && <div className="flex flex-wrap gap-1"><Button variant="outline" size="sm" disabled={busy || (plan.kind === 'installment' && !rows.length)} onClick={() => edit(plan)} aria-label={`Change future charges for ${plan.description}`}>Change future charges</Button><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="sm" disabled={busy}>Stop future entries</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Stop {plan.description}?</AlertDialogTitle><AlertDialogDescription>This stops future entries in Tally and keeps past charges. It does not cancel a subscription or agreement with your bank or provider.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep schedule</AlertDialogCancel><AlertDialogAction onClick={() => stop(plan)}>Stop future entries</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>}
        </Card>;
      })}</div>
    </>}
  </DialogContent></Dialog>;
}
