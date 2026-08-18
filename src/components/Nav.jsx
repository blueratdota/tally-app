import React from 'react';

const LABELS = {
  dashboard: 'Dashboard',
  creditcards: 'Credit Cards',
  loans: 'Loans',
  savings: 'Savings',
  transactions: 'Transactions'
};

export default function Nav({ page, setPage, pages }) {
  return (
    <header className="flex items-center justify-between flex-wrap gap-3.5 mb-6">
      <div className="font-display text-[22px] font-semibold tracking-wide">
        TALLY<span className="text-coral">.</span>
      </div>
      <nav className="flex gap-1.5 flex-wrap">
        {pages.map(p => (
          <button
            key={p}
            onClick={() => setPage(p)}
            className={
              'px-3.5 py-2 rounded-full text-[13px] font-medium border transition-colors ' +
              (page === p
                ? 'bg-gold text-surface border-gold font-semibold'
                : 'bg-surface text-muted border-white/10 hover:text-paper hover:bg-raised')
            }
          >
            {LABELS[p]}
          </button>
        ))}
      </nav>
    </header>
  );
}
