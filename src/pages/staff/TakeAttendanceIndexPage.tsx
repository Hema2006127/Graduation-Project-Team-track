import { Link } from 'react-router';
import { ClipboardCheck, Clock, Users } from 'lucide-react';
import type { Session } from '@/types';
import { rosterSummary, sortSessions } from '@/lib/attendance';
import { formatLongDate, formatTimeRange } from '@/lib/dates';
import { ROLE_HOME } from '@/lib/permissions';
import { useAttendanceData } from '@/hooks/queries';
import { useMe } from '@/context/AuthContext';
import { buttonClass } from '@/components/ui/Button';
import { Card, EmptyState, ErrorState, PageHeader, PageLoader, PhaseBadge } from '@/components/ui/Display';

/** Doctor's quick entry point: sessions happening now, today and those still missing attendance. */
export function TakeAttendanceIndexPage() {
  const me = useMe();
  const base = ROLE_HOME[me.role];
  const d = useAttendanceData();
  if (d.error) return <ErrorState error={d.error} onRetry={d.retry} />;
  if (d.isLoading || !d.index) return <PageLoader />;
  const idx = d.index;
  const today = idx.now.slice(0, 10);
  const phase = (s: Session) => idx.phase.get(s.id)!;
  const summary = (s: Session) => rosterSummary((idx.bySession.get(s.id) ?? []).map((r) => r.status));

  const active = d.sessions.filter((s) => phase(s) === 'active');
  const todayOther = sortSessions(d.sessions.filter((s) => s.session_date === today && phase(s) !== 'active' && phase(s) !== 'cancelled'));
  const pending = sortSessions(
    d.sessions.filter((s) => phase(s) === 'completed' && s.session_date !== today && summary(s).pending > 0),
    'desc',
  );
  const next = sortSessions(d.sessions.filter((s) => phase(s) === 'upcoming' && s.session_date > today)).slice(0, 3);

  const SessionCard = ({ s, highlight }: { s: Session; highlight?: boolean }) => {
    const sum = summary(s);
    return (
      <div className={highlight ? 'card border-green-300 p-5 ring-2 ring-green-500/20' : 'card p-5'}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{s.title}</p>
            <p className="mt-0.5 text-sm text-slate-500">{formatLongDate(s.session_date)}</p>
          </div>
          <PhaseBadge phase={phase(s)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5"><Clock className="size-4 text-slate-400" />{formatTimeRange(s.start_time, s.end_time)}</span>
          <span className="inline-flex items-center gap-1.5"><Users className="size-4 text-slate-400" />{sum.total} members</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">{sum.pending === sum.total ? 'Attendance not taken yet' : `${sum.total - sum.pending}/${sum.total} marked`}</p>
        <Link to={`${base}/sessions/${s.id}`} className={buttonClass(highlight ? 'primary' : 'secondary', 'lg', 'mt-4 w-full')}>
          <ClipboardCheck className="size-4" /> {sum.pending === sum.total ? 'Take attendance' : 'Open attendance'}
        </Link>
      </div>
    );
  };

  const Section = ({ title, list, highlight, empty }: { title: string; list: Session[]; highlight?: boolean; empty?: string }) =>
    list.length === 0 && !empty ? null : (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{title}</h2>
        {list.length === 0 ? (
          <Card><EmptyState title={empty!} /></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map((s) => <SessionCard key={s.id} s={s} highlight={highlight} />)}</div>
        )}
      </section>
    );

  return (
    <>
      <PageHeader title="Take Attendance" description="Open a session to mark Present, Absent, Late or Excused." />
      <div className="space-y-8">
        <Section title="Happening now" list={active} highlight empty={todayOther.length ? undefined : 'No session is running right now.'} />
        <Section title="Today" list={todayOther} />
        <Section title="Missing attendance" list={pending} />
        <Section title="Next sessions" list={next} />
      </div>
    </>
  );
}
