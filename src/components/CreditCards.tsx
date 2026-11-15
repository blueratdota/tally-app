import { peso, ownerLabel } from '@/lib/format';
import type { AccountType, Account } from '@/lib/api';
import type { OpenAccountModal } from '@/App';
import { PageHead, Rows, Row } from './rows';

const logo = (a: Account) => (
  <div className="w-[52px] h-[34px] rounded bg-muted flex items-center justify-center overflow-hidden shrink-0 text-xs text-muted-foreground">
    {a.logo_url ? <img src={a.logo_url} alt="" className="w-full h-full object-cover" /> : a.name.slice(0, 2)}
  </div>
);

export default function CreditCards({ byType, openAccountModal }: { byType: (t: AccountType) => Account[]; openAccountModal: OpenAccountModal }) {
  return (
    <div>
      <PageHead title="Credit cards" action="Add credit card" onAction={() => openAccountModal({ type: 'creditcard', account: null })} />
      <Rows empty="No credit cards yet. Add one to track what is billed and what is still building up.">
        {byType('creditcard').map(a => (
          <Row key={a.id} logo={logo(a)} title={a.name}
            sub={<>{ownerLabel(a.owner)}, cutoff day {a.cutoff_day}, due day {a.due_day}<span className="block">Not yet billed: {peso(a.outstanding)}</span>{(a.future ?? 0) > 0 && <span className="block">Upcoming installments: {peso(a.future)} total, {peso(a.dueNextMonth)} next month</span>}</>}
            amount={peso(a.current)} amountTone="text-destructive"
            onEdit={() => openAccountModal({ type: 'creditcard', account: a })} />
        ))}
      </Rows>
    </div>
  );
}
