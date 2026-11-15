import { peso, PEOPLE } from '@/lib/format';
import type { Account, AccountType, NetWorth, PersonSpending as PS, Spending, View } from '@/lib/api';
import type { Page } from '@/App';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Days until the card's next due day (clamped to short months).
function daysUntilDue(dueDay: number) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const at = (y: number, m: number) => new Date(y, m, Math.min(dueDay, new Date(y, m + 1, 0).getDate()));
  let due = at(today.getFullYear(), today.getMonth());
  if (due < today) due = at(today.getFullYear(), today.getMonth() + 1);
  return Math.round((due.getTime() - today.getTime()) / 864e5);
}

const dueText = (d: number) => (d === 0 ? 'due today' : d === 1 ? 'due tomorrow' : `due in ${d} days`);

function SumLine({ label, amount, sign, tone }: { label: string; amount: number; sign: string; tone: string }) {
  return (
    <div className="flex items-baseline justify-between py-2 border-b">
      <span className="text-muted-foreground text-[15px]">{sign} {label}</span>
      <span className={cn('font-display text-xl font-semibold', tone)}>{peso(amount)}</span>
    </div>
  );
}

function PersonSpending({ name, data }: { name: string; data: PS }) {
  const top = Object.entries(data.categories).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return (
    <Card className="p-4">
      <div className="font-medium">{name}</div>
      <div className="font-display text-2xl font-semibold mb-2">{peso(data.total)}</div>
      {top.length
        ? <ul className="text-sm text-muted-foreground space-y-0.5">{top.map(([c, v]) => <li key={c} className="flex justify-between gap-2"><span>{c}</span><span>{peso(v)}</span></li>)}</ul>
        : <p className="text-sm text-muted-foreground">No expenses yet</p>}
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
  const cards = byType('creditcard')
    .map(a => ({ ...a, days: daysUntilDue(Number(a.due_day)) }))
    .sort((a, b) => a.days - b.days);
  const empty = !netWorth.savings && !netWorth.cardDebt && !netWorth.loanDebt;

  return (
    <div className="max-w-xl">
      <section className="mb-10">
        <SumLine sign="" label="Savings" amount={netWorth.savings} tone="text-primary" />
        <SumLine sign="−" label="Credit card debt" amount={netWorth.cardDebt} tone="text-destructive" />
        {netWorth.futureDebt > 0 && (
          <div className="text-xs text-muted-foreground text-right -mt-1 py-1 border-b">
            plus {peso(netWorth.futureDebt)} in upcoming card installments (total with these: {peso(netWorth.cardDebt + netWorth.futureDebt)})
          </div>
        )}
        <SumLine sign="−" label="Loans" amount={netWorth.loanDebt} tone="text-destructive" />
        <div className="double-rule flex items-baseline justify-between pt-4 pb-3">
          <span className="font-semibold">Net worth</span>
          <span className="font-display font-bold tracking-tight text-[clamp(36px,9vw,52px)] leading-none">{peso(netWorth.netWorth)}</span>
        </div>
        {empty && <p className="text-muted-foreground text-sm mt-4">Nothing tracked yet. Add a savings account to start your total.</p>}
      </section>

      {spending && (
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-display text-lg font-semibold">Spent this month</h2>
            {view === 'all' && <span className="text-sm text-muted-foreground">Together {peso(spending.total)}</span>}
          </div>
          <div className={cn('grid gap-3', view === 'all' ? 'grid-cols-2' : 'grid-cols-1')}>
            {view !== 'p2' && <PersonSpending name={PEOPLE.p1} data={spending.p1} />}
            {view !== 'p1' && <PersonSpending name={PEOPLE.p2} data={spending.p2} />}
          </div>
          <Button variant="link" className="mt-1 px-0" onClick={() => setPage('transactions')}>See each transaction</Button>
        </section>
      )}

      {cards.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-2">Coming due</h2>
          <Card>
            <ul className="divide-y">
              {cards.map(a => (
                <li key={a.id} className="flex items-baseline justify-between px-4 py-3">
                  <span>
                    <span className="font-medium">{a.name}</span>
                    <span className={cn('block text-sm', a.days <= 3 ? 'text-destructive font-medium' : 'text-muted-foreground')}>{dueText(a.days)}</span>
                  </span>
                  <span className="font-display text-lg font-semibold">{peso(a.current)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Button variant="link" className="mt-1 px-0" onClick={() => setPage('creditcards')}>See all credit cards</Button>
        </section>
      )}
    </div>
  );
}
