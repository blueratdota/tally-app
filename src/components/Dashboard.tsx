import { usePeople, useCategoryStyle, CategoryLabel } from '@/lib/household';
import { peso, localDate } from '@/lib/format';
import type { Account, AccountType, NetWorth, PersonSpending as PS, Spending, View } from '@/lib/api';
import type { Page } from '@/App';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ArrowUpRight, Wallet, CreditCard, Landmark, CalendarDays } from 'lucide-react';

const dueText = (d: number) => d < 0 ? `${-d} ${d === -1 ? 'day' : 'days'} overdue` : d === 0 ? 'due today' : d === 1 ? 'due tomorrow' : `due in ${d} days`;

function PersonSpending({ name, data }: { name: string; data: PS }) {
  const style = useCategoryStyle();
  const top = Object.entries(data.categories).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-primary" aria-hidden="true">{name.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
        <span className="min-w-0 break-words text-sm font-semibold">{name}</span>
      </div>
      <div className="text-2xl font-bold tracking-tight break-all mb-5">{peso(data.total)}</div>
      {top.length ? <ul className="space-y-4">{top.map(([c, v]) => <li key={c}>
        <div className="flex flex-wrap justify-between gap-2 text-xs mb-2"><span className="text-muted-foreground"><CategoryLabel name={c} /></span><span className="font-semibold">{peso(v)}</span></div>
        <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full" style={{ background: style(c).color, width: `${data.total ? v / data.total * 100 : 0}%` }} /></div>
      </li>)}</ul> : <p className="text-sm text-muted-foreground">No expenses yet this month.</p>}
    </Card>
  );
}

interface Props {
  netWorth: NetWorth;
  spending: Spending | null;
  byType: (t: AccountType) => Account[];
  setPage: (p: Page) => void;
  view: View;
}

export default function Dashboard({ netWorth, spending, byType, setPage, view }: Props) {
  const PEOPLE = usePeople();
  const cards = byType('creditcard')
    .filter(a => (a.current ?? 0) > 0 && a.daysUntilDue != null)
    .map(a => ({ ...a, days: a.daysUntilDue! }))
    .sort((a, b) => a.days - b.days);
  const empty = !netWorth.savings && !netWorth.cardDebt && !netWorth.loanDebt;

  return (
    <div className="space-y-7 sm:space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs text-muted-foreground mb-1.5">THE BIG PICTURE</p><h1 className="text-3xl font-bold tracking-tight">Overview</h1></div>
        <span className="text-xs text-muted-foreground flex items-center gap-2"><CalendarDays className="size-4" aria-hidden="true" />{new Date(localDate() + 'T12:00:00').toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</span>
      </div>

      <section className="balance-hero relative isolate overflow-hidden rounded-3xl p-6 text-white sm:p-8" aria-label="Net worth summary">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <span className="text-sm text-white/75">Total net worth</span>
            <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-[11px] text-white/80"><span className="size-1.5 shrink-0 rounded-full bg-[#d6efbd]" /><span className="truncate">{view === 'all' ? 'Your household' : PEOPLE[view]}</span></span>
          </div>
          <div className="text-[clamp(30px,6vw,56px)] font-semibold leading-tight tracking-[-0.04em] break-all">{peso(netWorth.netWorth)}</div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/65">Savings minus credit card and loan balances</p>
            <Button variant="ghost" onClick={() => setPage('insights')} className="rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white px-4">Explore insights<ArrowUpRight aria-hidden="true" /></Button>
          </div>
        </div>
      </section>
      {empty && <p className="text-sm text-muted-foreground">Start with a savings account to bring your overview to life. <button className="font-semibold text-primary underline underline-offset-4" onClick={() => setPage('savings')}>Add an account</button></p>}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4" aria-label="Balances">
        {[
          { label: 'Savings', amount: netWorth.savings, icon: Wallet, page: 'savings' as Page, note: 'Across your savings accounts', tone: 'text-primary' },
          { label: 'Credit card debt', amount: netWorth.cardDebt, icon: CreditCard, page: 'creditcards' as Page, note: 'Billed + not yet billed', tone: 'text-foreground' },
          { label: 'Loans', amount: netWorth.loanDebt, icon: Landmark, page: 'loans' as Page, note: 'Remaining loan balance', tone: 'text-foreground' }
        ].map(({ label, amount, icon: Icon, page, note, tone }, i) => (
          <Card key={page} className={cn('p-4 sm:p-5', i === 0 && 'col-span-2 sm:col-span-1')}>
            <div className="flex items-center justify-between gap-2 mb-4"><span className="flex size-9 items-center justify-center rounded-xl bg-muted text-primary"><Icon className="size-[18px]" aria-hidden="true" /></span><Button variant="ghost" size="icon" className="-mr-2 text-muted-foreground" aria-label={`View ${label.toLowerCase()}`} onClick={() => setPage(page)}><ArrowUpRight aria-hidden="true" /></Button></div>
            <p className="text-xs text-muted-foreground mb-2">{label}</p>
            <p className={cn('text-xl sm:text-2xl font-bold tracking-tight break-all', tone)}>{peso(amount)}</p>
            <p className="text-[11px] text-muted-foreground mt-2">{note}</p>
          </Card>
        ))}
      </section>
      {netWorth.futureDebt > 0 && <p className="text-xs text-muted-foreground rounded-xl border border-dashed px-4 py-3">Upcoming installments: <span className="font-semibold text-foreground">{peso(netWorth.futureDebt)}</span> · Total card debt including these: {peso(netWorth.cardDebt + netWorth.futureDebt)}</p>}

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {spending && <section className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div><h2 className="text-lg font-bold tracking-tight">This month's spending</h2>{view === 'all' && <p className="text-xs text-muted-foreground mt-1">{peso(spending.total)} together</p>}</div>
            <Button variant="ghost" size="sm" className="text-primary" onClick={() => setPage('transactions')}>View activity<ArrowUpRight aria-hidden="true" /></Button>
          </div>
          <div className={cn('grid gap-3', view === 'all' ? 'sm:grid-cols-2' : 'grid-cols-1')}>
            {view !== 'p2' && <PersonSpending name={PEOPLE.p1} data={spending.p1} />}
            {view !== 'p1' && <PersonSpending name={PEOPLE.p2} data={spending.p2} />}
          </div>
        </section>}
        <section className="min-w-0">
          <div className="flex items-center justify-between gap-2 mb-4"><h2 className="text-lg font-bold tracking-tight">Coming due</h2><Button variant="ghost" size="sm" className="text-primary" onClick={() => setPage('creditcards')}>View cards<ArrowUpRight aria-hidden="true" /></Button></div>
          <Card>
            {cards.length ? <ul className="divide-y">{cards.map(a => <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div className="min-w-0 flex-1"><p className="font-semibold text-sm break-words">{a.name}</p><p className={cn('mt-1 text-xs', a.days <= 3 ? 'text-destructive' : 'text-muted-foreground')}>{dueText(a.days)}</p></div>
              <span className="text-sm font-bold break-all">{peso(a.current)}</span>
            </li>)}</ul> : <p className="p-6 text-sm text-muted-foreground">No billed card payments due.</p>}
          </Card>
        </section>
      </div>
    </div>
  );
}
