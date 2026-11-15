import React from 'react';
import { peso, ownerLabel } from '../lib/format.js';
import { PageHead, Rows, Row } from './ui.jsx';

const logo = a => (
  <div className="w-[52px] h-[34px] rounded bg-ground flex items-center justify-center overflow-hidden shrink-0 text-xs text-muted">
    {a.logo_url ? <img src={a.logo_url} alt="" className="w-full h-full object-cover" /> : a.name.slice(0, 2)}
  </div>
);

export default function CreditCards({ byType, openAccountModal }) {
  return (
    <div>
      <PageHead title="Credit cards" action="Add credit card" onAction={() => openAccountModal({ type: 'creditcard', account: null })} />
      <Rows empty="No credit cards yet. Add one to track what is billed and what is still building up.">
        {byType('creditcard').map(a => (
          <Row key={a.id} logo={logo(a)} title={a.name}
            sub={<>{ownerLabel(a.owner)}, cutoff day {a.cutoff_day}, due day {a.due_day}<span className="block">Not yet billed: {peso(a.outstanding)}</span></>}
            amount={peso(a.current)} amountTone="text-red"
            onEdit={() => openAccountModal({ type: 'creditcard', account: a })} />
        ))}
      </Rows>
    </div>
  );
}
