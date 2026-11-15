import React from 'react';
import { peso, PEOPLE } from '../lib/format.js';

// Days until the card's next due day (clamped to short months).
function daysUntilDue(dueDay) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const at = (y, m) => new Date(y, m, Math.min(dueDay, new Date(y, m + 1, 0).getDate()));
  let due = at(today.getFullYear(), today.getMonth());
  if (due < today) due = at(today.getFullYear(), today.getMonth() + 1);
  return Math.round((due - today) / 864e5);
}

const dueText = d => (d === 0 ? 'due today' : d === 1 ? 'due tomorrow' : `due in ${d} days`);

function SumLine({ label, amount, sign, tone }) {
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-line">
      <span className="text-muted text-[15px]">{sign} {label}</span>
      <span className={'font-display text-xl font-semibold ' + tone}>{peso(amount)}</span>
    </div>
  );
}

function PersonSpending({ name, data }) {
  const top = Object.entries(data.categories).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return (
    <div className="bg-surface border border-line rounded-md p-4">
      <div className="font-medium">{name}</div>
      <div className="font-display text-2xl font-semibold mb-2">{peso(data.total)}</div>
      {top.length
        ? <ul className="text-sm text-muted space-y-0.5">{top.map(([c, v]) => <li key={c} className="flex justify-between gap-2"><span>{c}</span><span>{peso(v)}</span></li>)}</ul>
        : <p className="text-sm text-muted">No expenses yet</p>}
    </div>
  );
}

export default function Dashboard({ netWorth, spending, byType, setPage }) {
  const cards = byType('creditcard')
    .map(a => ({ ...a, days: daysUntilDue(a.due_day) }))
    .sort((a, b) => a.days - b.days);
  const empty = !netWorth.savings && !netWorth.cardDebt && !netWorth.loanDebt;

  return (
    <div className="max-w-xl">
      <section className="mb-10">
        <SumLine sign="" label="Savings" amount={netWorth.savings} tone="text-blue" />
        <SumLine sign="−" label="Credit card debt" amount={netWorth.cardDebt} tone="text-red" />
        <SumLine sign="−" label="Loans" amount={netWorth.loanDebt} tone="text-red" />
        <div className="double-rule flex items-baseline justify-between pt-4 pb-3">
          <span className="font-semibold">Net worth</span>
          <span className="font-display font-bold tracking-tight text-[clamp(36px,9vw,52px)] leading-none">{peso(netWorth.netWorth)}</span>
        </div>
        {empty && <p className="text-muted text-sm mt-4">Nothing tracked yet. Add a savings account to start your total.</p>}
      </section>

      {spending && (
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-display text-lg font-semibold">Spent this month</h2>
            <span className="text-sm text-muted">Together {peso(spending.total)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <PersonSpending name={PEOPLE.p1} data={spending.p1} />
            <PersonSpending name={PEOPLE.p2} data={spending.p2} />
          </div>
          <button onClick={() => setPage('transactions')} className="mt-3 text-sm text-blue font-medium hover:underline">See each transaction</button>
        </section>
      )}

      {cards.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-2">Coming due</h2>
          <ul className="bg-surface border border-line rounded-md divide-y divide-line">
            {cards.map(a => (
              <li key={a.id} className="flex items-baseline justify-between px-4 py-3">
                <span>
                  <span className="font-medium">{a.name}</span>
                  <span className={'block text-sm ' + (a.days <= 3 ? 'text-red font-medium' : 'text-muted')}>{dueText(a.days)}</span>
                </span>
                <span className="font-display text-lg font-semibold">{peso(a.current)}</span>
              </li>
            ))}
          </ul>
          <button onClick={() => setPage('creditcards')} className="mt-3 text-sm text-blue font-medium hover:underline">See all credit cards</button>
        </section>
      )}
    </div>
  );
}
