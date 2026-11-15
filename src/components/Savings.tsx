import { useState, type FormEvent } from 'react';
import { usePeople } from '@/lib/household';
import { peso, ownerLabel, CATEGORIES } from '@/lib/format';
import { api, type AccountType, type Account, type Goal, type Person } from '@/lib/api';
import type { OpenAccountModal } from '@/App';
import { PageHead, Rows, Row } from './rows';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function BalanceAdjustment({ account, onClose, onSaved }: { account: Account; onClose: () => void; onSaved: () => Promise<void> }) {
  const names = usePeople();
  const [balance, setBalance] = useState(String(account.balance ?? 0));
  const [person, setPerson] = useState(account.owner === 'shared' ? '' : account.owner);
  const [category, setCategory] = useState('Balance adjustment');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const delta = Number(balance) - Number(account.balance || 0);
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.adjustBalance(account, Number(balance), person as Person, category); await onSaved(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={o => !o && onClose()}><DialogContent className="bg-card max-w-md"><DialogHeader><DialogTitle>Adjust current balance</DialogTitle></DialogHeader>
    <p className="text-sm text-muted-foreground break-words">{account.name} · Currently {peso(account.balance)}</p>
    <form onSubmit={save} className="grid gap-4">
      <div className="grid gap-2"><Label htmlFor="actual-balance">Actual current balance (₱)</Label><Input id="actual-balance" type="number" step="0.01" required value={balance} onChange={e => setBalance(e.target.value)} /></div>
      <p className="text-xs text-muted-foreground">{!Number.isFinite(delta) ? 'Enter a balance.' : !delta ? 'No adjustment is needed.' : `This records ${peso(Math.abs(delta))} as ${delta < 0 ? 'an expense' : 'income'}. Your existing transactions stay intact.`}</p>
      {!!delta && <div className="grid gap-2"><Label htmlFor="adjust-person">Attribute adjustment to</Label><Select required value={person} onValueChange={setPerson}><SelectTrigger id="adjust-person"><SelectValue placeholder="Choose a person" /></SelectTrigger><SelectContent>{Object.entries(names).map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></div>}
      {delta < 0 && <div className="grid gap-2"><Label htmlFor="adjust-category">Expense category</Label><Select value={category} onValueChange={setCategory}><SelectTrigger id="adjust-category"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy || (!!delta && !person)}>{busy ? 'Saving…' : 'Save balance adjustment'}</Button>
    </form>
  </DialogContent></Dialog>;
}

function GoalModal({ goal, accounts, onClose, onSaved }: { goal: Goal | null; accounts: Account[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(goal?.name || ''); const [account, setAccount] = useState(goal?.account_id || accounts[0]?.id || '');
  const [target, setTarget] = useState(String(goal?.target || '')); const [saved, setSaved] = useState(String(goal?.saved || 0));
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.saveGoal({ id: goal?.id, name, account_id: account, target: Number(target), saved: Number(saved) }); await onSaved(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try { await api.archiveGoal(goal!.id); await onSaved(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={o => !o && onClose()}><DialogContent className="bg-card max-w-md"><DialogHeader><DialogTitle>{goal ? 'Edit savings goal' : 'Add savings goal'}</DialogTitle></DialogHeader>
    <p className="text-xs text-muted-foreground">Reserve money inside an existing account. Goals do not add another balance or move money between accounts.</p>
    <form onSubmit={save} className="grid gap-4">
      <div className="grid gap-2"><Label htmlFor="goal-name">Goal name</Label><Input id="goal-name" required value={name} onChange={e => setName(e.target.value)} placeholder="Emergency fund, Travel, Annual bills" /></div>
      <div className="grid gap-2"><Label htmlFor="goal-account">Savings account</Label><Select required value={account} onValueChange={setAccount}><SelectTrigger id="goal-account"><SelectValue /></SelectTrigger><SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="goal-target">Target (₱)</Label><Input id="goal-target" required type="number" min="0.01" step="0.01" value={target} onChange={e => setTarget(e.target.value)} /></div><div className="grid gap-2"><Label htmlFor="goal-saved">Reserved now (₱)</Label><Input id="goal-saved" required type="number" min="0" step="0.01" value={saved} onChange={e => setSaved(e.target.value)} /></div></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy}>{busy ? 'Saving…' : 'Save goal'}</Button>
      {goal && <Button type="button" variant="outline" disabled={busy} onClick={remove}>Remove goal and release reservation</Button>}
    </form>
  </DialogContent></Dialog>;
}

export default function Savings({ byType, openAccountModal, goals, reload }: { byType: (t: AccountType) => Account[]; openAccountModal: OpenAccountModal; goals: Goal[]; reload: () => Promise<void> }) {
  const names = usePeople(); const accounts = byType('savings');
  const [adjust, setAdjust] = useState<Account | null>(null); const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const visibleGoals = goals.filter(g => accounts.some(a => a.id === g.account_id));
  return <div className="space-y-6">
    <PageHead title="Savings" action="Add savings account" onAction={() => openAccountModal({ type: 'savings', account: null })} />
    <Rows empty="No savings accounts yet. Add one to start tracking what you have.">
      {accounts.map(a => {
        const reserved = visibleGoals.filter(g => g.account_id === a.id).reduce((n, g) => n + Math.round(Number(g.saved) * 100), 0) / 100;
        return <Row key={a.id} title={a.name} amount={peso(a.balance)} amountTone="text-primary" onEdit={() => openAccountModal({ type: 'savings', account: a })} sub={<div className="space-y-2"><p>{ownerLabel(a.owner, names)}</p>{reserved > 0 && <><p>Reserved for goals: {peso(reserved)}</p><p>Available: {peso(Math.max(0, Number(a.balance) - reserved))}</p>{reserved > Number(a.balance) && <p className="text-destructive">Goals exceed this balance by {peso(reserved - Number(a.balance))}. Adjust your reservations.</p>}</>}<Button variant="outline" size="sm" onClick={() => setAdjust(a)}>Adjust balance</Button></div>} />;
      })}
    </Rows>
    <section className="space-y-4"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Savings goals</h2><Button variant="outline" disabled={!accounts.length} onClick={() => setEditing('new')}>Add goal</Button></div>
      {!visibleGoals.length && <p className="text-sm text-muted-foreground">Set aside part of an account for a goal without counting it twice.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visibleGoals.map(g => <Card key={g.id} className="p-5 space-y-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="font-semibold break-words">{g.name}</h3><p className="text-xs text-muted-foreground mt-1">{accounts.find(a => a.id === g.account_id)?.name}</p></div><Button variant="ghost" size="sm" aria-label={`Edit goal ${g.name}`} onClick={() => setEditing(g)}>Edit</Button></div><p className="text-sm break-words">{peso(g.saved)} <span className="text-muted-foreground">of {peso(g.target)}</span></p><progress className="h-2 w-full accent-primary" value={g.saved} max={g.target} aria-label={`${g.name} progress`} /><p className="text-xs text-muted-foreground">{peso(Math.max(0, g.target - g.saved))} left to reserve</p></Card>)}</div>
    </section>
    {adjust && <BalanceAdjustment account={adjust} onClose={() => setAdjust(null)} onSaved={async () => { setAdjust(null); await reload(); }} />}
    {editing && <GoalModal goal={editing === 'new' ? null : editing} accounts={accounts} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />}
  </div>;
}
