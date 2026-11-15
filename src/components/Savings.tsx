import { peso, ownerLabel } from '@/lib/format';
import type { AccountType, Account } from '@/lib/api';
import type { OpenAccountModal } from '@/App';
import { PageHead, Rows, Row } from './rows';

export default function Savings({ byType, openAccountModal }: { byType: (t: AccountType) => Account[]; openAccountModal: OpenAccountModal }) {
  return (
    <div>
      <PageHead title="Savings" action="Add savings account" onAction={() => openAccountModal({ type: 'savings', account: null })} />
      <Rows empty="No savings accounts yet. Add one to start tracking what you have.">
        {byType('savings').map(a => (
          <Row key={a.id} title={a.name} sub={ownerLabel(a.owner)} amount={peso(a.balance)} amountTone="text-primary"
            onEdit={() => openAccountModal({ type: 'savings', account: a })} />
        ))}
      </Rows>
    </div>
  );
}
