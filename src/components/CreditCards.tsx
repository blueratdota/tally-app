import { usePeople } from '@/lib/household';
import { peso, ownerLabel } from '@/lib/format';
import type { AccountType, Account } from '@/lib/api';
import type { OpenAccountModal } from '@/App';
import { PageHead, Rows, Row } from './rows';
import { cn } from '@/lib/utils';

// "Dec 7 · in 20 days", from the oldest unpaid statement the server worked out.
export const due = (a: Account) => {
  if (!a.dueDate || a.daysUntilDue == null) return 'Nothing due';
  const d = a.daysUntilDue, when = d < 0 ? `${-d} ${d === -1 ? 'day' : 'days'} overdue` : d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
  return `${new Date(a.dueDate + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} · ${when}`;
};

const logo = (a: Account) => (
  <div className="w-[52px] h-10 rounded-xl bg-muted flex items-center justify-center overflow-hidden shrink-0 text-xs text-muted-foreground">
    {a.logo_url ? <img src={a.logo_url} alt="" className="w-full h-full object-contain" /> : a.name.slice(0, 2)}
  </div>
);

export default function CreditCards({ byType, openAccountModal, onOpen }: { byType: (t: AccountType) => Account[]; openAccountModal: OpenAccountModal; onOpen: (id: string) => void }) {
  const names = usePeople();
  return (
    <div>
      <PageHead title="Credit cards" action="Add credit card" onAction={() => openAccountModal({ type: 'creditcard', account: null })} />
      <Rows empty="No credit cards yet. Add one to track what is billed and what is still building up.">
        {byType('creditcard').map(a => (
          <Row key={a.id} logo={logo(a)} title={a.name}
            sub={<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt>Due</dt><dd className={cn('text-right font-medium', a.daysUntilDue != null && a.daysUntilDue <= 3 ? 'text-destructive' : 'text-foreground')}>{due(a)}</dd>
              <dt>Not yet billed</dt><dd className="text-right font-medium text-foreground">{peso(a.outstanding)}</dd>
              {(a.future ?? 0) > 0 && <><dt>Upcoming installments</dt><dd className="text-right font-medium text-foreground">{peso(a.future)}<span className="block font-normal text-muted-foreground">{peso(a.dueNextMonth)} next month</span></dd></>}
              <dt className="col-span-2 mt-1.5 border-t pt-2.5">{ownerLabel(a.owner, names)} · cutoff day {a.cutoff_day} · due day {a.due_day}</dt>
            </dl>}
            amountLabel="Billed balance" amount={peso(a.current)} amountTone="text-destructive"
            onEdit={() => openAccountModal({ type: 'creditcard', account: a })}
            onOpen={() => onOpen(a.id)} openLabel={`Show transactions for ${a.name}`} />
        ))}
      </Rows>
    </div>
  );
}
