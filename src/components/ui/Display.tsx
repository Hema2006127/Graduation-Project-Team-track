import type { ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import type { AttendanceStatus, MemberStatus, SessionPhase } from '@/types';
import { STATUS_META } from '@/lib/attendance';
import { Button } from './Button';

// ---- Badges -------------------------------------------------------------------
type Tone = 'green' | 'red' | 'amber' | 'blue' | 'slate' | 'indigo';
const TONE: Record<Tone, string> = {
  green: 'bg-green-50 text-green-700 ring-green-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};
const DOT: Record<Tone, string> = {
  green: 'bg-success',
  red: 'bg-danger',
  amber: 'bg-warning',
  blue: 'bg-primary',
  indigo: 'bg-indigo-500',
  slate: 'bg-slate-400',
};

export function Badge({ tone = 'slate', dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset', TONE[tone], className)}>
      {dot && <span className={clsx('size-1.5 rounded-full', DOT[tone])} aria-hidden />}
      {children}
    </span>
  );
}

export const ATTENDANCE_TONE: Record<AttendanceStatus, Tone> = { present: 'green', absent: 'red', late: 'amber', excused: 'blue' };

export function AttendanceBadge({ status }: { status: AttendanceStatus | null }) {
  if (!status) return <Badge tone="slate">Not recorded</Badge>;
  return (
    <Badge tone={ATTENDANCE_TONE[status]} dot>
      {STATUS_META[status].label}
    </Badge>
  );
}

const PHASE: Record<SessionPhase, { tone: Tone; label: string }> = {
  upcoming: { tone: 'blue', label: 'Upcoming' },
  active: { tone: 'green', label: 'Active' },
  completed: { tone: 'slate', label: 'Completed' },
  cancelled: { tone: 'red', label: 'Cancelled' },
};
export function PhaseBadge({ phase }: { phase: SessionPhase }) {
  return (
    <Badge tone={PHASE[phase].tone} dot className={phase === 'active' ? '[&>span]:animate-pulse' : undefined}>
      {PHASE[phase].label}
    </Badge>
  );
}

export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  return (
    <Badge tone={status === 'active' ? 'green' : 'slate'} dot>
      {status === 'active' ? 'Active' : 'Inactive'}
    </Badge>
  );
}

// ---- Layout pieces ------------------------------------------------------------
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={clsx('card min-w-0', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          {typeof title === 'string' ? <h2 className="text-sm font-semibold text-ink">{title}</h2> : title}
          {actions}
        </div>
      )}
      <div className={bodyClassName ?? 'p-5'}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'blue',
  hint,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: Tone;
  hint?: ReactNode;
}) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <div className={clsx('flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset', TONE[tone])}>{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-bold tracking-tight text-ink tabular-nums">{value}</p>
        {hint && <p className="truncate text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}

// ---- States -----------------------------------------------------------------------
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin text-primary', className ?? 'size-6')} aria-label="Loading" />;
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-slate-500" role="status">
      <Spinner className="size-8" />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-lg bg-slate-200/70', className)} />;
}

export function EmptyState({ title, description, icon, action }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        {icon ?? <Inbox className="size-6" />}
      </div>
      <p className="font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-12 text-center" role="alert">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-red-50 text-danger">
        <AlertCircle className="size-6" />
      </div>
      <p className="font-semibold text-ink">Couldn’t load data</p>
      <p className="mt-1 max-w-md text-sm text-slate-500">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4" icon={<RefreshCw className="size-4" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

// ---- Avatar & progress -------------------------------------------------------------
const AVATAR_BG = ['bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700'];

export function Avatar({ name, src, size = 'md' }: { name: string; src?: string | null; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const initials = name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const cls = clsx(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold',
    size === 'sm' && 'size-8 text-xs',
    size === 'md' && 'size-10 text-sm',
    size === 'lg' && 'size-14 text-lg',
    size === 'xl' && 'size-20 text-2xl',
  );
  if (src) return <img src={src} alt={name} className={clsx(cls, 'object-cover')} />;
  return (
    <span className={clsx(cls, AVATAR_BG[hash % AVATAR_BG.length])} aria-hidden>
      {initials}
    </span>
  );
}

const RATE_COLOR = { good: '#16A34A', warn: '#F59E0B', bad: '#DC2626', none: '#CBD5E1' };

/** Circular attendance indicator. */
export function ProgressRing({ value, tone, size = 120, label }: { value: number | null; tone: keyof typeof RATE_COLOR; size?: number; label?: string }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${label ?? 'Attendance'}: ${value === null ? 'no data' : pct.toFixed(1) + '%'}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={RATE_COLOR[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-2xl font-bold text-ink tabular-nums">{value === null ? '—' : `${Math.round(pct)}%`}</p>
        {label && <p className="text-[11px] text-slate-500">{label}</p>}
      </div>
    </div>
  );
}

/** Horizontal rate bar used in tables. */
export function RateBar({ value, tone }: { value: number | null; tone: keyof typeof RATE_COLOR }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${value ?? 0}%`, background: RATE_COLOR[tone] }} />
      </div>
      <span className="w-12 text-right text-sm font-medium text-slate-700 tabular-nums">{value === null ? '—' : `${value.toFixed(1)}%`}</span>
    </div>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="-mx-px overflow-x-auto">{children}</div>;
}
