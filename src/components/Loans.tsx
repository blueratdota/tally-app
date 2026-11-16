import { usePeople } from '@/lib/household';
import { peso, ownerLabel } from '@/lib/format';
import type { AccountType, Account } from '@/lib/api';
import type { OpenAccountModal } from '@/App';
import { PageHead, Rows, Row } from './rows';
import { due } from './CreditCards';
import { cn } from '@/lib/utils';

export default function Loans({ byType, openAccountModal }: { byType: (t: AccountType) => Account[]; openAccountModal: OpenAccountModal }) {
  const names = usePeople();
  return (
    <div>
      <PageHead title="Loans" action="Add loan" onAction={() => openAccountModal({ type: 'loan', account: null })} />
      <Rows empty="No loans tracked. Add one to see how much you still owe.">
        {byType('loan').map(a => (
          <Row key={a.id} title={a.name} sub={<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              {a.dueThisMonth == null ? <dt className="col-span-2">Edit to add a monthly payment and due day.</dt> : <>
                <dt>Due this month</dt><dd className="text-right font-medium text-foreground">{a.dueThisMonth > 0 ? peso(a.dueThisMonth) : 'Paid'}</dd>
                {a.dueThisMonth > 0 && <><dt>Due</dt><dd className={cn('text-right font-medium', (a.daysUntilDue ?? 9) <= 3 ? 'text-destructive' : 'text-foreground')}>{due(a)}</dd></>}
                {!!a.paymentsLeft && <><dt>Payments left</dt><dd className="text-right font-medium text-foreground">{a.paymentsLeft}<span className="block font-normal text-muted-foreground">last on {new Date(a.lastDueDate + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}</span></dd></>}
              </>}
              <dt className="col-span-2 mt-1.5 border-t pt-2.5">{ownerLabel(a.owner, names)}{a.dueThisMonth != null && ` · ${peso(a.monthly_payment)} monthly · due day ${a.due_day}`}</dt>
            </dl>} amountLabel="Remaining balance" amount={peso(a.balance)} amountTone="text-destructive"
            onEdit={() => openAccountModal({ type: 'loan', account: a })} />
        ))}
      </Rows>
    </div>
  );
}
