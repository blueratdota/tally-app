import React from 'react';

const LABELS = {
  dashboard: 'Overview',
  creditcards: 'Credit cards',
  loans: 'Loans',
  savings: 'Savings',
  transactions: 'Transactions'
};

export default function Nav({ page, setPage, pages }) {
  return (
    <header className="mb-8">
      <div className="font-display text-2xl font-bold tracking-tight mb-3">Tally</div>
      <nav className="flex gap-5 overflow-x-auto border-b border-line -mx-5 px-5">
        {pages.map(p => (
          <button
            key={p}
            onClick={() => setPage(p)}
            aria-current={page === p ? 'page' : undefined}
            className={
              'pb-2.5 -mb-px text-sm whitespace-nowrap border-b-2 transition-colors ' +
              (page === p ? 'border-blue text-ink font-semibold' : 'border-transparent text-muted hover:text-ink')
            }
          >
            {LABELS[p]}
          </button>
        ))}
      </nav>
    </header>
  );
}
