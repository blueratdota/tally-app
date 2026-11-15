import { peso, ownerLabel } from '@/lib/format';
import type { AccountType, Account } from '@/lib/api';
import type { OpenAccountModal } from '@/App';
import { PageHead, Rows, Row } from './rows';

export default function Loans({ byType, openAccountModal }: { byType: (t: AccountType) => Account[]; openAccountModal: OpenAccountModal }) {
  return (
    <div>
      <PageHead title="Loans" action="Add loan" onAction={() => openAccountModal({ type: 'loan', account: null })} />
      <Rows empty="No loans tracked. Add one to see how much you still owe.">
        {byType('loan').map(a => (
          <Row key={a.id} title={a.name} sub={`${ownerLabel(a.owner)}, remaining balance`} amount={peso(a.balance)} amountTone="text-destructive"
            onEdit={() => openAccountModal({ type: 'loan', account: a })} />
        ))}
      </Rows>
    </div>
  );
}
