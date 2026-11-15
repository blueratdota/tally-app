import { useState } from 'react';
import { toast } from 'sonner';
import { peso, PEOPLE } from '@/lib/format';
import { api, type Transaction } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AccountName = (id?: string) => string;

function TxLine({ t, accountName, onVoid }: { t: Transaction; accountName: AccountName; onVoid: (id: string) => void }) {
  const who = t.person && PEOPLE[t.person] ? PEOPLE[t.person] + ': ' : '';
  const [detail, sign, tone] =
    t.type === 'income' ? [`→ ${accountName(t.to_account_id)}`, '+', 'text-primary']
    : t.type === 'expense' ? [`${t.category || 'Other'}, ${accountName(t.from_account_id)}`, '-', 'text-destructive']
    : [`${accountName(t.from_account_id)} → ${accountName(t.to_account_id)}`, '', 'text-foreground'];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[60px_minmax(0,1fr)_auto_auto] items-center gap-2.5 py-2.5 border-b border-dashed border-foreground/20 text-sm last:border-none">
      <span className="col-span-2 text-muted-foreground text-xs sm:col-span-1">{t.date.slice(5)}</span>
      <span className="min-w-0 break-words font-medium">{t.description}<span className="block text-xs text-muted-foreground font-normal mt-0.5">{who}{detail}</span></span>
      <span className={cn('text-right font-semibold whitespace-nowrap', tone)}>{sign}{peso(t.amount)}</span>
      <Button variant="outline" size="sm" onClick={() => onVoid(t.id)}
        className="col-start-2 sm:col-start-auto px-2 text-xs text-muted-foreground hover:bg-destructive hover:border-destructive hover:text-destructive-foreground">
        Void
      </Button>
    </div>
  );
}

export default function Transactions({ transactions, accountName, reload }: { transactions: Transaction[]; accountName: AccountName; reload: () => Promise<void> }) {
  const [limit, setLimit] = useState(100);
  async function handleVoid(id: string) {
    try {
      await api.voidTransaction(id);
      toast('Transaction voided');
      await reload();
    } catch (err) {
      toast.error('Failed: ' + (err as Error).message);
    }
  }

  return (
    <div>
      <h2 className="font-display text-xl font-semibold mb-4">Transactions</h2>
      <div className="bg-card shadow-[0_10px_30px_rgba(15,27,51,0.12)]">
        <div className="receipt-torn" />
        <div className="text-center pt-[18px] pb-3 px-5 border-b border-dashed border-foreground/30">
          <div className="font-display font-semibold">All activity</div>
        </div>
        <div className="px-3 sm:px-[22px] py-1.5 sm:max-h-[60dvh] sm:overflow-y-auto">
          {transactions.length
            ? transactions.slice(0, limit).map(t => <TxLine key={t.id} t={t} accountName={accountName} onVoid={handleVoid} />)
            : <div className="text-center py-8 text-muted-foreground text-sm">No transactions yet. Use Record transaction to add the first one.</div>}
          {transactions.length > limit && (
            <Button variant="ghost" size="sm" className="w-full my-2" onClick={() => setLimit(l => l + 100)}>
              Show more ({transactions.length - limit} left)
            </Button>
          )}
        </div>
        <div className="receipt-torn flip" />
      </div>
    </div>
  );
}
