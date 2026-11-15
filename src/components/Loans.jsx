import React from 'react';
import { peso, ownerLabel } from '../lib/format.js';
import { PageHead, Rows, Row } from './ui.jsx';

export default function Loans({ byType, openAccountModal }) {
  return (
    <div>
      <PageHead title="Loans" action="Add loan" onAction={() => openAccountModal({ type: 'loan', account: null })} />
      <Rows empty="No loans tracked. Add one to see how much you still owe.">
        {byType('loan').map(a => (
          <Row key={a.id} title={a.name} sub={`${ownerLabel(a.owner)}, remaining balance`} amount={peso(a.balance)} amountTone="text-red"
            onEdit={() => openAccountModal({ type: 'loan', account: a })} />
        ))}
      </Rows>
    </div>
  );
}
