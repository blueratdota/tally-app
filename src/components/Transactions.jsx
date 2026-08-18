import React from 'react';
import { peso } from '../lib/format.js';
import { api } from '../lib/api.js';

function TxLine({ t, accountName, onVoid }) {
  let desc, sign, colorClass;
  if (t.type === 'income') {
    desc = <>{t.description}<span className="block text-[10px] text-[#8a919a] font-normal uppercase tracking-wide mt-0.5">→ {accountName(t.to_account_id)}</span></>;
    sign = '+'; colorClass = 'text-mint';
  } else if (t.type === 'expense') {
    desc = <>{t.description}<span className="block text-[10px] text-[#8a919a] font-normal uppercase tracking-wide mt-0.5">{t.category || 'Other'} · {accountName(t.from_account_id)}</span></>;
    sign = '-'; colorClass = 'text-coral';
  } else {
    desc = <>{t.description}<span className="block text-[10px] text-[#8a919a] font-normal uppercase tracking-wide mt-0.5">{accountName(t.from_account_id)} → {accountName(t.to_account_id)}</span></>;
    sign = ''; colorClass = 'text-[#1C2C3A]';
  }
  return (
    <div className="grid grid-cols-[72px_1fr_auto_auto] items-center gap-2.5 py-2.5 border-b border-dashed border-[#1C2C3A]/20 font-mono text-[13px] last:border-none">
      <span className="text-[#6b7178] text-[11px]">{t.date.slice(5)}</span>
      <span className="font-medium">{desc}</span>
      <span className={'font-semibold whitespace-nowrap ' + colorClass}>{sign}{peso(t.amount)}</span>
      <button onClick={() => onVoid(t.id)}
        className="border border-[#1C2C3A]/25 text-[#6b7178] text-[10px] tracking-wide px-2 py-1 rounded-md hover:bg-coral hover:border-coral hover:text-white transition">
        VOID
      </button>
    </div>
  );
}

export default function Transactions({ transactions, accountName, showToast, reload }) {
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
      <h2 className="font-display text-xl mb-4">Transactions</h2>
      <div className="bg-paper text-[#1C2C3A] rounded-sm shadow-[0_20px_40px_rgba(0,0,0,0.25)] pb-5">
        <div className="receipt-torn" />
        <div className="text-center pt-[18px] pb-3 px-5 border-b border-dashed border-[#1C2C3A]/30">
          <div className="font-mono font-semibold tracking-[3px] text-[13px]">ALL ACTIVITY</div>
        </div>
        <div className="px-[22px] py-1.5 max-h-[460px] overflow-y-auto">
          {transactions.length
            ? transactions.map(t => <TxLine key={t.id} t={t} accountName={accountName} onVoid={handleVoid} />)
            : <div className="text-center py-8 text-[#8a919a] font-mono text-[13px]">No transactions yet.</div>}
        </div>
        <div className="receipt-torn flip" />
      </div>
    </div>
  );
}
