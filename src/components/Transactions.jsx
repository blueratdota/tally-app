import React, { useState } from 'react';
import { peso, PEOPLE } from '../lib/format.js';
import { api } from '../lib/api.js';

function TxLine({ t, accountName, onVoid }) {
  let desc, sign, colorClass;
  if (t.type === 'income') {
    desc = <>{t.description}<span className="block text-xs text-[#5B6679] font-normal mt-0.5">{PEOPLE[t.person] ? PEOPLE[t.person] + ': ' : ''}→ {accountName(t.to_account_id)}</span></>;
    sign = '+'; colorClass = 'text-blue';
  } else if (t.type === 'expense') {
    desc = <>{t.description}<span className="block text-xs text-[#5B6679] font-normal mt-0.5">{PEOPLE[t.person] ? PEOPLE[t.person] + ': ' : ''}{t.category || 'Other'}, {accountName(t.from_account_id)}</span></>;
    sign = '-'; colorClass = 'text-red';
  } else {
    desc = <>{t.description}<span className="block text-xs text-[#5B6679] font-normal mt-0.5">{PEOPLE[t.person] ? PEOPLE[t.person] + ': ' : ''}{accountName(t.from_account_id)} → {accountName(t.to_account_id)}</span></>;
    sign = ''; colorClass = 'text-ink';
  }
  return (
    <div className="grid grid-cols-[72px_1fr_auto_auto] items-center gap-2.5 py-2.5 border-b border-dashed border-ink/20 text-sm last:border-none">
      <span className="text-muted text-xs">{t.date.slice(5)}</span>
      <span className="font-medium">{desc}</span>
      <span className={'font-semibold whitespace-nowrap ' + colorClass}>{sign}{peso(t.amount)}</span>
      <button onClick={() => onVoid(t.id)}
        className="border border-ink/25 text-muted text-xs px-2 py-1 rounded hover:bg-red hover:border-red hover:text-white transition">
        Void
      </button>
    </div>
  );
}

export default function Transactions({ transactions, accountName, showToast, reload }) {
  const [who, setWho] = useState('all');
  const shown = who === 'all' ? transactions : transactions.filter(t => t.person === who);
  async function handleVoid(id) {
    try {
      await api.voidTransaction(id);
      showToast('Transaction voided');
      await reload();
    } catch (err) {
      showToast('Failed: ' + err.message, true);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 className="font-display text-xl font-semibold">Transactions</h2>
        <div className="flex gap-1.5" role="group" aria-label="Show transactions for">
          {[['all', 'Both of you'], ...Object.entries(PEOPLE)].map(([id, name]) => (
            <button key={id} onClick={() => setWho(id)} aria-pressed={who === id}
              className={'px-3 py-1.5 rounded-full text-sm border ' + (who === id ? 'bg-ink text-white border-ink' : 'bg-surface text-muted border-line')}>
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-surface text-ink shadow-[0_10px_30px_rgba(15,27,51,0.12)]">
        <div className="receipt-torn" />
        <div className="text-center pt-[18px] pb-3 px-5 border-b border-dashed border-ink/30">
          <div className="font-display font-semibold">All activity</div>
        </div>
        <div className="px-[22px] py-1.5 max-h-[460px] overflow-y-auto">
          {shown.length
            ? shown.map(t => <TxLine key={t.id} t={t} accountName={accountName} onVoid={handleVoid} />)
            : <div className="text-center py-8 text-muted text-sm">No transactions yet. Use Record transaction to add the first one.</div>}
        </div>
        <div className="receipt-torn flip" />
      </div>
    </div>
  );
}
