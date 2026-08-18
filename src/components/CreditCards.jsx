import React from 'react';
import { peso } from '../lib/format.js';

function CardTile({ a, onEdit }) {
  return (
    <div className="bg-surface border border-white/10 rounded-2xl p-4 px-[18px] flex items-center gap-3.5">
      <div className="w-[52px] h-[34px] rounded-md bg-raised flex items-center justify-center overflow-hidden shrink-0 font-mono text-[10px] text-muted">
        {a.logo_url ? <img src={a.logo_url} alt="" className="w-full h-full object-cover" /> : a.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{a.name}</div>
        <div className="text-xs text-muted mt-0.5 font-mono">Cutoff: day {a.cutoff_day} · Due: day {a.due_day}</div>
      </div>
      <div className="text-right">
        <div className="text-[13px] mb-0.5"><span className="text-muted text-[11px] mr-1.5">Due now</span><span className="font-mono font-semibold text-coral">{peso(a.current)}</span></div>
        <div className="text-[13px]"><span className="text-muted text-[11px] mr-1.5">Outstanding</span><span className="font-mono font-semibold">{peso(a.outstanding)}</span></div>
      </div>
      <button onClick={onEdit} title="Edit" className="w-[30px] h-[30px] rounded-lg border border-white/10 text-muted hover:text-paper hover:bg-raised flex items-center justify-center shrink-0">✎</button>
    </div>
  );
}

export default function CreditCards({ byType, openAccountModal }) {
  const list = byType('creditcard');
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-display text-xl m-0">Credit Cards</h2>
        <button className="bg-gold text-surface font-semibold text-[13px] px-[18px] py-2.5 rounded-lg hover:bg-[#f7c866] active:scale-[0.98] transition"
          onClick={() => openAccountModal({ type: 'creditcard', account: null })}>
          + Add card
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {list.length
          ? list.map(a => <CardTile key={a.id} a={a} onEdit={() => openAccountModal({ type: 'creditcard', account: a })} />)
          : <div className="text-center py-8 text-muted font-mono text-[13px]">No credit cards yet. Add one above.</div>}
      </div>
    </div>
  );
}
