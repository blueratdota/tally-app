import { useState } from 'react';
import { peso, PEOPLE } from '@/lib/format';
import type { NetWorthPoint, Transaction, View } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Two validated series hues (dataviz validator: CVD ΔE 29, both ≥3:1 on white).
const BLUE = '#2f5fd0', ORANGE = '#c2700a';
const W = 640, H = 220, PAD = { l: 76, r: 12, t: 12, b: 26 };
const PROJECT = 6; // months of trajectory shown past today

const monthLabel = (m: string, withYear = false) =>
  new Date(m + '-01T00:00:00').toLocaleDateString('en-PH', { month: 'short', ...(withYear && { year: 'numeric' }) });
const addMonths = (m: string, n: number) => {
  const d = new Date(m + '-01T00:00:00');
  return new Date(d.getFullYear(), d.getMonth() + n, 1).toLocaleDateString('en-CA').slice(0, 7);
};
const short = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? '-₱' : '₱';
  return a >= 1e6 ? s + (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? s + Math.round(a / 1e3) + 'k' : s + Math.round(a);
};

function yScale(vals: number[]) {
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const ticks = [0, 1, 2, 3].map(i => lo + ((hi - lo) * i) / 3);
  return { y, ticks };
}

function Axes({ ticks, y, labels }: { ticks: number[]; y: (v: number) => number; labels: [string, number][] }) {
  return <>
    {ticks.map(t => <g key={t}>
      <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
      <text x={PAD.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[20px] sm:text-[11px]">{short(t)}</text>
    </g>)}
    {labels.map(([l, cx]) => <text key={l + cx} x={cx} y={H - 6} textAnchor={cx > W - PAD.r - 20 ? 'end' : 'middle'} className="fill-muted-foreground text-[20px] sm:text-[11px]">{l}</text>)}
  </>;
}

function Tooltip({ left, children }: { left: number; children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute top-1 z-10 rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-md whitespace-nowrap"
      style={{ left: `${(left / W) * 100}%`, transform: left > W / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)' }}>
      {children}
    </div>
  );
}

function NetWorthChart({ history }: { history: NetWorthPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const last = history[history.length - 1];
  const base = history[Math.max(0, history.length - 7)];
  const span = history.length - 1 - history.indexOf(base);
  // ponytail: straight-line trend from the average monthly change over the last 6 months.
  const perMonth = span ? (last.netWorth - base.netWorth) / span : 0;
  const future = Array.from({ length: PROJECT }, (_, i) => ({ month: addMonths(last.month, i + 1), netWorth: last.netWorth + perMonth * (i + 1) }));
  const all = [...history, ...future];
  const { y, ticks } = yScale(all.map(p => p.netWorth));
  const x = (i: number) => PAD.l + (i / (all.length - 1)) * (W - PAD.l - PAD.r);
  const path = (pts: NetWorthPoint[], off: number) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i + off)},${y(p.netWorth)}`).join('');
  const h = hover === null ? null : all[hover];
  const trackPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(all.length - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (all.length - 1)))));
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h3 className="font-display font-semibold">Net worth trajectory</h3>
        <span className="text-sm text-muted-foreground">
          {perMonth >= 0 ? '+' : ''}{peso(perMonth)}/month · at this pace <span className="font-semibold text-foreground">{peso(future[PROJECT - 1].netWorth)}</span> by {monthLabel(future[PROJECT - 1].month, true)}
        </span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
          aria-label={`Net worth over the last ${history.length} months, projected ${PROJECT} months ahead`}
          onPointerLeave={() => setHover(null)}
          onPointerDown={trackPointer} onPointerMove={trackPointer}>
          <Axes ticks={ticks} y={y} labels={all.map((p, i) => [i % 3 === 0 || i === all.length - 1 ? monthLabel(p.month) : '', x(i)] as [string, number]).filter(l => l[0])} />
          <path d={path([last, ...future], history.length - 1)} fill="none" stroke={BLUE} strokeWidth={2} strokeDasharray="5 5" opacity={0.7} />
          <path d={path(history, 0)} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" />
          <circle cx={x(history.length - 1)} cy={y(last.netWorth)} r={4} fill={BLUE} className="stroke-card" strokeWidth={2} />
          {h && hover !== null && <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="stroke-muted-foreground" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(h.netWorth)} r={4} fill={BLUE} className="stroke-card" strokeWidth={2} />
          </>}
        </svg>
        {h && hover !== null && (
          <Tooltip left={x(hover)}>
            <div className="text-muted-foreground">{monthLabel(h.month, true)}{hover >= history.length && ' · projected'}</div>
            <div className="font-semibold">{peso(h.netWorth)}</div>
          </Tooltip>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1">Solid: month-end net worth. Dashed: projection. Loans use today's balance throughout.</p>
    </Card>
  );
}

interface MonthRow { month: string; income: number; spent: number }

function CashflowChart({ rows }: { rows: MonthRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const { y, ticks } = yScale([0, ...rows.flatMap(r => [r.income, r.spent])]);
  const slot = (W - PAD.l - PAD.r) / rows.length;
  const bw = Math.min(14, (slot - 8) / 2);
  const bar = (v: number, cx: number, color: string) => {
    const top = y(v), h = Math.max(0, y(0) - top);
    // 4px rounded data-end, square at the baseline
    const r = Math.min(4, h);
    return <path d={`M${cx},${y(0)}V${top + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${y(0)}Z`} fill={color} />;
  };
  const h = hover === null ? null : rows[hover];
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h3 className="font-display font-semibold">Money in vs. spent</h3>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: BLUE }} />Income</span>
          <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: ORANGE }} />Spent</span>
        </div>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Monthly income and spending, last 12 months" onPointerLeave={() => setHover(null)}>
          <Axes ticks={ticks} y={y} labels={rows.map((r, i) => [i % 2 === rows.length % 2 ? '' : monthLabel(r.month), PAD.l + slot * (i + 0.5)] as [string, number]).filter(l => l[0])} />
          {rows.map((r, i) => {
            const cx = PAD.l + slot * (i + 0.5);
            return <g key={r.month} opacity={hover === null || hover === i ? 1 : 0.45}>
              {bar(r.income, cx - bw - 1, BLUE)}
              {bar(r.spent, cx + 1, ORANGE)}
              <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" onPointerEnter={() => setHover(i)} />
            </g>;
          })}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="stroke-muted-foreground" strokeWidth={1} />
        </svg>
        {h && hover !== null && (
          <Tooltip left={PAD.l + slot * (hover + 0.5)}>
            <div className="text-muted-foreground">{monthLabel(h.month, true)}</div>
            <div>Income <span className="font-semibold">{peso(h.income)}</span></div>
            <div>Spent <span className="font-semibold">{peso(h.spent)}</span></div>
          </Tooltip>
        )}
      </div>
    </Card>
  );
}

const th = 'px-3 py-2 text-left font-medium text-muted-foreground text-xs';
const td = 'px-3 py-2 text-right whitespace-nowrap';

function MonthTable({ rows }: { rows: MonthRow[] }) {
  return (
    <Card className="overflow-x-auto" tabIndex={0} role="region" aria-label="Monthly cash flow; scroll for more columns">
      <table className="w-full min-w-[540px] text-sm">
        <thead className="border-b"><tr>
          <th className={th}>Month</th><th className={cn(th, 'text-right')}>Income</th><th className={cn(th, 'text-right')}>Spent</th>
          <th className={cn(th, 'text-right')}>Net</th><th className={cn(th, 'text-right')}>Kept</th>
        </tr></thead>
        <tbody className="divide-y">
          {[...rows].reverse().map(r => {
            const net = r.income - r.spent;
            return <tr key={r.month}>
              <td className="px-3 py-2 whitespace-nowrap">{monthLabel(r.month, true)}</td>
              <td className={td}>{peso(r.income)}</td>
              <td className={td}>{peso(r.spent)}</td>
              <td className={cn(td, 'font-medium', net < 0 ? 'text-destructive' : 'text-primary')}>{peso(net)}</td>
              <td className={cn(td, 'text-muted-foreground')}>{r.income > 0 ? Math.round((net / r.income) * 100) + '%' : '—'}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </Card>
  );
}

function CategoryTable({ transactions, month, view }: { transactions: Transaction[]; month: string; view: View }) {
  const prev = [1, 2, 3].map(n => addMonths(month, -n));
  const now: Record<string, number> = {}, avg: Record<string, number> = {};
  const byPerson: Record<string, Record<string, number>> = {};
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    const m = t.date.slice(0, 7), c = t.category || 'Other', a = Number(t.amount);
    if (m === month) {
      now[c] = (now[c] || 0) + a;
      if (t.person) (byPerson[c] ||= {})[t.person] = (byPerson[c][t.person] || 0) + a;
    } else if (prev.includes(m)) avg[c] = (avg[c] || 0) + a / 3;
  }
  const cats = Object.keys({ ...now, ...avg }).sort((a, b) => (now[b] || 0) - (now[a] || 0) || (avg[b] || 0) - (avg[a] || 0));
  const max = Math.max(1, ...cats.map(c => Math.max(now[c] || 0, avg[c] || 0)));
  if (!cats.length) return <Card className="p-4 text-sm text-muted-foreground">No expenses in the last four months.</Card>;
  return (
    <Card className="overflow-x-auto" tabIndex={0} role="region" aria-label="Spending categories; scroll for more columns">
      <table className="w-full min-w-[540px] text-sm">
        <thead className="border-b"><tr>
          <th className={th}>Category</th>
          <th className={cn(th, 'w-[40%]')}><span className="sr-only">Bar</span></th>
          <th className={cn(th, 'text-right')}>This month</th>
          {view === 'all' && <th className={cn(th, 'text-right')}>{PEOPLE.p1} / {PEOPLE.p2}</th>}
          <th className={cn(th, 'text-right')}>3-mo avg</th>
          <th className={cn(th, 'text-right')}>vs avg</th>
        </tr></thead>
        <tbody className="divide-y">
          {cats.map(c => {
            const n = now[c] || 0, a = avg[c] || 0, diff = a ? (n - a) / a : null;
            return <tr key={c}>
              <td className="px-3 py-2">{c}</td>
              <td className="px-3 py-2">
                <div className="relative h-2.5 rounded-sm bg-muted">
                  <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${(n / max) * 100}%`, background: ORANGE }} />
                  {a > 0 && <div className="absolute -inset-y-0.5 w-0.5 bg-foreground" style={{ left: `${(a / max) * 100}%` }} title="3-month average" />}
                </div>
              </td>
              <td className={cn(td, 'font-medium')}>{peso(n)}</td>
              {view === 'all' && <td className={cn(td, 'text-muted-foreground text-xs')}>{short(byPerson[c]?.p1 || 0)} / {short(byPerson[c]?.p2 || 0)}</td>}
              <td className={cn(td, 'text-muted-foreground')}>{peso(a)}</td>
              <td className={cn(td, 'text-xs', diff !== null && diff > 0.1 ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                {diff === null ? 'new' : (diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : '') + Math.abs(Math.round(diff * 100)) + '%'}
              </td>
            </tr>;
          })}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground px-3 py-2 border-t">Bar: this month so far. Tick: average of the previous three months.</p>
    </Card>
  );
}

export default function Insights({ transactions, history, view }: { transactions: Transaction[]; history: NetWorthPoint[]; view: View }) {
  const month = new Date().toLocaleDateString('en-CA').slice(0, 7);
  const rows: MonthRow[] = Array.from({ length: 12 }, (_, i) => ({ month: addMonths(month, i - 11), income: 0, spent: 0 }));
  const idx = Object.fromEntries(rows.map((r, i) => [r.month, i]));
  for (const t of transactions) {
    const r = rows[idx[t.date.slice(0, 7)]];
    if (!r) continue;
    if (t.type === 'income') r.income += Number(t.amount);
    else if (t.type === 'expense') r.spent += Number(t.amount);
  }

  return (
    <div className="space-y-8">
      {history.length > 1 && <NetWorthChart history={history} />}
      <section className="space-y-3">
        <CashflowChart rows={rows} />
        <p className="text-xs text-muted-foreground sm:hidden">Swipe tables sideways to see all columns.</p>
        <MonthTable rows={rows} />
      </section>
      <section>
        <h2 className="font-display text-lg font-semibold mb-2">Spending by category</h2>
        <CategoryTable transactions={transactions} month={month} view={view} />
      </section>
    </div>
  );
}
