import React from 'react';
import { peso, ownerLabel } from '../lib/format.js';
import { PageHead, Rows, Row } from './ui.jsx';

export default function Savings({ byType, openAccountModal }) {
  return (
    <div>
      <PageHead title="Savings" action="Add savings account" onAction={() => openAccountModal({ type: 'savings', account: null })} />
      <Rows empty="No savings accounts yet. Add one to start tracking what you have.">
        {byType('savings').map(a => (
          <Row key={a.id} title={a.name} sub={ownerLabel(a.owner)} amount={peso(a.balance)} amountTone="text-blue"
            onEdit={() => openAccountModal({ type: 'savings', account: a })} />
        ))}
      </Rows>
    </div>
  );
}
