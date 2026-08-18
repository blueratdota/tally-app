import React from 'react';
import { peso } from '../lib/format.js';

function SummaryCard({ title, colorClass, list, lineFn }) {
  return (
    <div className="bg-surface border border-white/10 rounded-2xl p-5">
      <h3 className="font-display text-[15px] font-semibold mb-3.5 flex items-center gap-2">
        <span className={'w-2 h-2 rounded-full inline-block ' + colorClass} />
        {title}
      </h3>
      {list.length ? (
        list.slice(0, 4).map(a => (
          <div key={a.id} className="text-[13px] text-muted mb-1.5 font-mono">{lineFn(a)}</div>
        ))
      ) : (
        <div className="text-[13px] text-muted font-mono">Nothing yet</div>
      )}
    </div>
  );
}

export default function Dashboard({ netWorth, byType }) {
  const [whole, cents] = peso(netWorth.netWorth).replace('₱', '').split('.');

  return (
    <div>
      <div className="relative overflow-hidden bg-gradient-to-br from-raised to-surface border border-white/10 rounded-[20px] p-8 pb-7 mb-5">
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-[radial-gradient(circle,rgba(242,184,75,0.16),transparent_70%)]" />
        <div className="relative">
          <div className="font-mono text-xs tracking-widest uppercase text-mint mb-1.5">Net worth right now</div>
          <div className="font-display font-semibold leading-none tracking-tight text-[clamp(36px,6vw,56px)]">
            ₱{whole}<span className="text-muted text-[0.5em]">.{cents || '00'}</span>
          </div>
          <div className="flex gap-6 flex-wrap mt-4 font-mono text-[13px]">
            <div className="text-muted">Savings<b className="block text-mint text-[15px] mt-0.5 font-semibold">{peso(netWorth.savings)}</b></div>
            <div className="text-muted">Credit card debt<b className="block text-coral text-[15px] mt-0.5 font-semibold">{peso(netWorth.cardDebt)}</b></div>
            <div className="text-muted">Loan debt<b className="block text-coral text-[15px] mt-0.5 font-semibold">{peso(netWorth.loanDebt)}</b></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px]">
        <SummaryCard title="Credit Cards" colorClass="bg-coral" list={byType('creditcard')} lineFn={a => `${a.name}: ${peso(a.current)} due`} />
        <SummaryCard title="Loans" colorClass="bg-violet" list={byType('loan')} lineFn={a => `${a.name}: ${peso(a.balance)}`} />
        <SummaryCard title="Savings" colorClass="bg-mint" list={byType('savings')} lineFn={a => `${a.name}: ${peso(a.balance)}`} />
      </div>
    </div>
  );
}
