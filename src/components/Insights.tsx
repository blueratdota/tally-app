import { usePeople, useCategoryStyle, CategoryLabel } from '@/lib/household';
import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { peso, localDate } from '@/lib/format';
import type { NetWorthPoint, Person, Transaction, View } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

const BLUE = '#0f766e', ORANGE = '#bd592a';
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

// Insights can be bucketed by day, week (Monday start), month or year. Keys sort as strings.
export type Period = 'day' | 'week' | 'month' | 'year';
const PERIODS: Record<Period, { label: string; count: number; now: string; unit: string; column: string }> = {
  day: { label: 'Daily', count: 14, now: 'Today', unit: 'days', column: 'Day' },
  week: { label: 'Weekly', count: 12, now: 'This week', unit: 'weeks', column: 'Week' },
  month: { label: 'Monthly', count: 12, now: 'This month', unit: 'months', column: 'Month' },
  year: { label: 'Yearly', count: 5, now: 'This year', unit: 'years', column: 'Year' },
};
const iso = (d: Date) => d.toLocaleDateString('en-CA');
const day = (s: string) => new Date(s + 'T00:00:00');
function keyOf(date: string, p: Period) {
  if (p === 'day') return date;
  if (p === 'month') return date.slice(0, 7);
  if (p === 'year') return date.slice(0, 4);
  const d = day(date); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d);
}
function shift(key: string, p: Period, n: number) {
  if (p === 'month') return addMonths(key, n);
  if (p === 'year') return String(Number(key) + n);
  const d = day(key); d.setDate(d.getDate() + n * (p === 'week' ? 7 : 1)); return iso(d);
}
function labelOf(key: string, p: Period, long = false) {
  if (p === 'year') return key;
  if (p === 'month') return monthLabel(key, long);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', ...(long && { year: 'numeric' }), ...(long && p === 'day' && { weekday: 'short' }) };
  return (long && p === 'week' ? 'Week of ' : '') + day(key).toLocaleDateString('en-PH', opts);
}

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
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h3 className="font-display font-bold tracking-tight">Net worth trajectory</h3>
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

interface PeriodRow { key: string; income: number; spent: number }

function CashflowChart({ rows, period }: { rows: PeriodRow[]; period: Period }) {
  const [hover, setHover] = useState<number | null>(null);
  const { y, ticks } = yScale([0, ...rows.flatMap(r => [r.income, r.spent])]);
  const slot = (W - PAD.l - PAD.r) / rows.length;
  const bw = Math.min(14, (slot - 8) / 2);
  const bar = (v: number, cx: number, color: string) => {
    const top = Math.min(y(v), y(0)), height = Math.abs(y(0) - y(v));
    return <rect x={cx} y={top} width={bw} height={height} rx={Math.min(4, height / 2)} fill={color} />;
  };
  const h = hover === null ? null : rows[hover];
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h3 className="font-display font-bold tracking-tight">Money in vs. spent</h3>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: BLUE }} />Income</span>
          <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: ORANGE }} />Spent</span>
        </div>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${PERIODS[period].label} income and spending, last ${rows.length} ${PERIODS[period].unit}`} onPointerLeave={() => setHover(null)}>
          {/* At most ~6 axis labels, always including the latest bucket. */}
          <Axes ticks={ticks} y={y} labels={rows.map((r, i) => [(rows.length - 1 - i) % Math.ceil(rows.length / 6) === 0 ? labelOf(r.key, period) : '', PAD.l + slot * (i + 0.5)] as [string, number]).filter(l => l[0])} />
          {rows.map((r, i) => {
            const cx = PAD.l + slot * (i + 0.5);
            return <g key={r.key} opacity={hover === null || hover === i ? 1 : 0.45}>
              {bar(r.income, cx - bw - 1, BLUE)}
              {bar(r.spent, cx + 1, ORANGE)}
              <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" onPointerEnter={() => setHover(i)} />
            </g>;
          })}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="stroke-muted-foreground" strokeWidth={1} />
        </svg>
        {h && hover !== null && (
          <Tooltip left={PAD.l + slot * (hover + 0.5)}>
            <div className="text-muted-foreground">{labelOf(h.key, period, true)}</div>
            <div>Income <span className="font-semibold">{peso(h.income)}</span></div>
            <div>Spent <span className="font-semibold">{peso(h.spent)}</span></div>
          </Tooltip>
        )}
      </div>
    </Card>
  );
}

const th = 'bg-muted/50 px-4 py-3 text-left font-semibold text-muted-foreground text-[11px]';
const td = 'px-4 py-3 text-right whitespace-nowrap';

function PeriodTable({ rows, period, onMonth }: { rows: PeriodRow[]; period: Period; onMonth: (m: string) => void }) {
  return (
    <Card className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${PERIODS[period].label} cash flow; scroll for more columns`}>
      <table className="w-full min-w-[540px] text-sm">
        <thead className="border-b"><tr>
          <th className={th}>{PERIODS[period].column}</th><th className={cn(th, 'text-right')}>Income</th><th className={cn(th, 'text-right')}>Spent</th>
          <th className={cn(th, 'text-right')}>Net</th><th className={cn(th, 'text-right')}>Kept</th>
        </tr></thead>
        <tbody className="divide-y">
          {[...rows].reverse().map(r => {
            const net = r.income - r.spent;
            return <tr key={r.key}>
              <td className="px-3 py-2 whitespace-nowrap">{period === 'month'
                ? <button type="button" className="rounded text-left hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" aria-label={`Show ${labelOf(r.key, period, true)} transactions`} onClick={() => onMonth(r.key)}>{labelOf(r.key, period, true)}</button>
                : labelOf(r.key, period, true)}</td>
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

function CategoryTable({ transactions, current, period, view, onCategory }: { transactions: Transaction[]; current: string; period: Period; view: View; onCategory: (c: string) => void }) {
  const PEOPLE = usePeople(); const style = useCategoryStyle();
  const prev = [1, 2, 3].map(n => shift(current, period, -n));
  const now: Record<string, number> = {}, avg: Record<string, number> = {};
  const byPerson: Record<string, Record<string, number>> = {};
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    const m = keyOf(t.date, period), c = t.category || 'Other', a = Number(t.amount);
    if (m === current) {
      now[c] = (now[c] || 0) + a;
      if (t.person) (byPerson[c] ||= {})[t.person] = (byPerson[c][t.person] || 0) + a;
    } else if (prev.includes(m)) avg[c] = (avg[c] || 0) + a / 3;
  }
  const cats = Object.keys({ ...now, ...avg }).sort((a, b) => (now[b] || 0) - (now[a] || 0) || (avg[b] || 0) - (avg[a] || 0));
  const max = Math.max(1, ...cats.map(c => Math.max(now[c] || 0, avg[c] || 0)));
  if (!cats.length) return <Card className="p-4 text-sm text-muted-foreground">No expenses in the last four {PERIODS[period].unit}.</Card>;
  return (
    <Card className="overflow-x-auto" tabIndex={0} role="region" aria-label="Spending categories; scroll for more columns">
      {/* Phones show category, bar, this month and change; the per-person and average columns appear from sm up. */}
      <table className="w-full text-sm sm:min-w-[540px]">
        <thead className="border-b"><tr>
          <th className={th}>Category</th>
          <th className={cn(th, 'w-[22%] sm:w-[40%]')}><span className="sr-only">Bar</span></th>
          <th className={cn(th, 'text-right')}>{PERIODS[period].now}</th>
          {view === 'all' && <th className={cn(th, 'hidden text-right sm:table-cell')}>{PEOPLE.p1} / {PEOPLE.p2}</th>}
          <th className={cn(th, 'hidden text-right sm:table-cell')}>3-{PERIODS[period].column.toLowerCase()} avg</th>
          <th className={cn(th, 'text-right')}>vs avg</th>
        </tr></thead>
        <tbody className="divide-y">
          {cats.map(c => {
            const n = now[c] || 0, a = avg[c] || 0, diff = a ? (n - a) / a : null;
            return <tr key={c}>
              <td className="px-3 py-2"><button type="button" className="rounded text-left hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" aria-label={`Show ${c} transactions`} onClick={() => onCategory(c)}><CategoryLabel name={c} /></button></td>
              <td className="px-3 py-2">
                <div className="relative h-2.5 rounded-sm bg-muted">
                  <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${(n / max) * 100}%`, background: style(c).color }} />
                  {a > 0 && <div className="absolute -inset-y-0.5 w-0.5 bg-foreground" style={{ left: `${(a / max) * 100}%` }} title="3-month average" />}
                </div>
              </td>
              <td className={cn(td, 'font-medium')}>{peso(n)}</td>
              {view === 'all' && <td className={cn(td, 'hidden text-muted-foreground text-xs sm:table-cell')}>{short(byPerson[c]?.p1 || 0)} / {short(byPerson[c]?.p2 || 0)}</td>}
              <td className={cn(td, 'hidden text-muted-foreground sm:table-cell')}>{peso(a)}</td>
              <td className={cn(td, 'text-xs', diff !== null && diff > 0.1 ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                {diff === null ? 'new' : (diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : '') + Math.abs(Math.round(diff * 100)) + '%'}
              </td>
            </tr>;
          })}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground px-3 py-2 border-t">Bar: {PERIODS[period].now.toLowerCase()} so far. Tick: average of the previous three {PERIODS[period].unit}.</p>
    </Card>
  );
}

export default function Insights({ transactions, history, view, onViewChange, onCategory, onMonth }: { transactions: Transaction[]; history: NetWorthPoint[]; view: View; onViewChange: (view: View) => void; onCategory: (c: string) => void; onMonth: (m: string) => void }) {
  const PEOPLE = usePeople();
  const [period, setPeriod] = useState<Period>('month');
  const { count, now } = PERIODS[period];
  const current = keyOf(localDate(), period);
  const rows: PeriodRow[] = Array.from({ length: count }, (_, i) => ({ key: shift(current, period, i - count + 1), income: 0, spent: 0 }));
  const idx = Object.fromEntries(rows.map((r, i) => [r.key, i]));
  for (const t of transactions) {
    const r = rows[idx[keyOf(t.date, period)]];
    if (!r) continue;
    if (t.type === 'income') r.income += Number(t.amount);
    else if (t.type === 'expense') r.spent += Number(t.amount);
  }

  return (
    <div className="space-y-6">
      <div><h2 className="text-3xl font-bold tracking-tight">Insights</h2><p className="text-sm text-muted-foreground mt-2 break-words">{view === 'all' ? 'Your household and each person, at a glance.' : `Income, spending, and trends for ${PEOPLE[view]}.`}</p></div>
      <ToggleGroup type="single" value={view} onValueChange={v => v && onViewChange(v as View)} aria-label="Insights view" className="grid grid-cols-3 rounded-2xl bg-muted p-1 sm:max-w-md">
        {([['all', 'Combined'], ...Object.entries(PEOPLE)] as [View, string][]).map(([id, name]) => <ToggleGroupItem key={id} value={id} className="min-w-0 rounded-xl px-2 text-xs data-[state=on]:bg-foreground data-[state=on]:text-white"><span className="truncate">{name}</span></ToggleGroupItem>)}
      </ToggleGroup>
      <ToggleGroup type="single" value={period} onValueChange={v => v && setPeriod(v as Period)} aria-label="Group insights by" className="grid grid-cols-4 rounded-2xl bg-muted p-1 sm:max-w-md">
        {(Object.entries(PERIODS) as [Period, typeof PERIODS[Period]][]).map(([id, { label }]) => <ToggleGroupItem key={id} value={id} className="min-w-0 rounded-xl px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{label}</ToggleGroupItem>)}
      </ToggleGroup>
      <section aria-label={`Individual summaries, ${now.toLowerCase()}`} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="min-w-0 max-w-full break-words text-lg font-bold tracking-tight">{now}{view === 'all' ? ', by person' : ` · ${PEOPLE[view]}`}</h3>
          {view !== 'all' && <Button variant="ghost" size="sm" onClick={() => onViewChange('all')}>Compare both people</Button>}
        </div>
        <p className="text-xs text-muted-foreground">Based on the person tagged on each transaction, including joint-account activity. Transfers are excluded.</p>
        <div className={cn('grid gap-4', view === 'all' && 'sm:grid-cols-2')}>
          {(Object.entries(PEOPLE) as [Person, string][]).filter(([id]) => view === 'all' || id === view).map(([id, name]) => {
            const personal = transactions.filter(t => t.person === id && keyOf(t.date, period) === current);
            const income = personal.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
            const spent = personal.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);
            return <Card key={id} role="region" aria-label={`${name}, ${now.toLowerCase()}`} className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-2 mb-4">
                <h4 className="min-w-0 flex-1 break-words text-sm font-bold">{name}</h4>
                {view === 'all' && <Button variant="ghost" size="sm" className="text-primary" aria-label={`View insights for ${name}`} onClick={() => onViewChange(id)}>Details<ArrowUpRight aria-hidden="true" /></Button>}
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Income</dt><dd className="font-semibold break-all">{peso(income)}</dd></div>
                <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Expenses</dt><dd className="font-semibold break-all">{peso(spent)}</dd></div>
                <div className="flex flex-wrap justify-between gap-2 border-t pt-3"><dt className="text-muted-foreground">Net cash flow</dt><dd className={cn('font-bold break-all', income - spent < 0 ? 'text-destructive' : 'text-primary')}>{peso(income - spent)}</dd></div>
              </dl>
            </Card>;
          })}
        </div>
      </section>
      {history.length > 1 && <div className="space-y-2">
        <NetWorthChart key={view} history={history} />
        {period !== 'month' && <p className="text-xs text-muted-foreground">Net worth is tracked at each month-end, so this chart stays monthly.</p>}
        {view !== 'all' && <p className="text-xs text-muted-foreground break-words">Only {PEOPLE[view]}'s own accounts are included. Joint accounts appear in Combined view.</p>}
      </div>}
      <section className="space-y-3">
        <CashflowChart key={view + period} rows={rows} period={period} />
        <p className="text-xs text-muted-foreground sm:hidden">Swipe tables sideways to see all columns.</p>
        <PeriodTable rows={rows} period={period} onMonth={onMonth} />
      </section>
      <section>
        <h2 className="font-display text-lg font-semibold mb-2">Spending by category</h2>
        <CategoryTable transactions={transactions} current={current} period={period} view={view} onCategory={onCategory} />
      </section>
    </div>
  );
}
