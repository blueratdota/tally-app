import React from 'react';
import { peso } from '../lib/format.js';

export default function Savings({ byType, openAccountModal }) {
  const list = byType('savings');
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-display text-xl m-0">Savings</h2>
        <button className="bg-gold text-surface font-semibold text-[13px] px-[18px] py-2.5 rounded-lg hover:bg-[#f7c866] active:scale-[0.98] transition"
          onClick={() => openAccountModal({ type: 'savings', account: null })}>
          + Add account
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {list.length ? list.map(a => (
          <div key={a.id} className="bg-surface border border-white/10 rounded-2xl p-4 px-[18px] flex items-center gap-3.5">
            <div className="w-[52px] h-[34px] rounded-md bg-raised flex items-center justify-center text-lg shrink-0">💰</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{a.name}</div>
              <div className="text-xs text-muted mt-0.5 font-mono">Savings account</div>
            </div>
            <div className="font-mono font-semibold text-mint text-[15px]">{peso(a.balance)}</div>
            <button onClick={() => openAccountModal({ type: 'savings', account: a })} title="Edit"
              className="w-[30px] h-[30px] rounded-lg border border-white/10 text-muted hover:text-paper hover:bg-raised flex items-center justify-center shrink-0">✎</button>
          </div>
        )) : <div className="text-center py-8 text-muted font-mono text-[13px]">No savings accounts yet. Add one above.</div>}
      </div>
    </div>
  );
}
