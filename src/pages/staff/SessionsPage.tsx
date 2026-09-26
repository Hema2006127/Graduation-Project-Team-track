import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Ban, CalendarDays, ClipboardCheck, MapPin, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import type { Session, SessionPhase } from '@/types';
import { api } from '@/services';
import { rosterSummary, sessionStats, sortSessions, formatRate } from '@/lib/attendance';
import { formatDate, formatTimeRange } from '@/lib/dates';
import { qk, useApiMutation, useAttendanceData, useCan } from '@/hooks/queries';
import { useViewer } from '@/context/AuthContext';
import { Card, EmptyState, ErrorState, PageHeader, PhaseBadge, Skeleton, TableWrap } from '@/components/ui/Display';
import { Button, IconButton, buttonClass } from '@/components/ui/Button';
import { FilterSelect, SearchInput } from '@/components/ui/Form';
import { useConfirm } from '@/components/ui/Modal';
import { SessionFormModal } from './SessionFormModal';

type Tab = 'upcoming' | 'past' | 'cancelled' | 'all';
const TABS: { key: Tab; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
];
const inTab = (tab: Tab, p: SessionPhase) =>
  tab === 'all' || (tab === 'upcoming' && (p === 'upcoming' || p === 'active')) || (tab === 'past' && p === 'completed') || (tab === 'cancelled' && p === 'cancelled');

function RowMenu({ session, phase, onEdit }: { session: Session; phase: SessionPhase; onEdit: () => void }) {
  const perms = useCan();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const cancel = useApiMutation((cancelled: boolean) => api.setSessionCancelled(session.id, cancelled), {
    invalidate: [qk.sessions],
    success: (s) => (s.status === 'cancelled' ? `Session cancelled — ${s.title}` : `Session restored — ${s.title}`),
  });
  const remove = useApiMutation(() => api.deleteSession(session.id), { invalidate: [qk.sessions, qk.attendance], success: `Session deleted — ${session.title}` });

  const item = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100';
  return (
    <div className="relative" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <IconButton label={`Actions for ${session.title}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <MoreHorizontal className="size-4" />
      </IconButton>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 animate-pop-in rounded-xl border border-slate-200 bg-white p-1 shadow-lg" role="menu">
          <button role="menuitem" className={item} onClick={() => (setOpen(false), onEdit())}>
            <Pencil className="size-4 text-slate-400" /> Edit date & time
          </button>
          {phase === 'cancelled' ? (
            <button role="menuitem" className={item} onClick={() => (setOpen(false), cancel.mutate(false))}>
              <RotateCcw className="size-4 text-slate-400" /> Restore session
            </button>
          ) : (
            <button
              role="menuitem"
              className={clsx(item, 'text-amber-700')}
              onClick={async () => {
                setOpen(false);
                if (await confirm({ title: 'Cancel this session?', message: `“${session.title}” will be marked as cancelled and will not count towards anyone’s attendance percentage.`, confirmLabel: 'Cancel session' }))
                  cancel.mutate(true);
              }}
            >
              <Ban className="size-4" /> Cancel session
            </button>
          )}
          {perms.deleteSessions && (
            <button
              role="menuitem"
              className={clsx(item, 'text-danger hover:bg-red-50')}
              onClick={async () => {
                setOpen(false);
                if (await confirm({ title: 'Delete session permanently?', message: 'This also deletes every attendance record of this session. Prefer cancelling to keep history.', confirmLabel: 'Delete' }))
                  remove.mutate();
              }}
            >
              <Trash2 className="size-4" /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function SessionsPage() {
  const { base } = useViewer();
  const perms = useCan();
  const d = useAttendanceData();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [search, setSearch] = useState('');
  const [doctor, setDoctor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);

  const rows = useMemo(() => {
    if (!d.index) return [];
    const q = search.trim().toLowerCase();
    const list = d.sessions.filter((s) => {
      const p = d.index!.phase.get(s.id)!;
      return (
        inTab(tab, p) &&
        (!doctor || s.doctor_id === doctor) &&
        (!from || s.session_date >= from) &&
        (!to || s.session_date <= to) &&
        (!q || [s.title, s.team_group, s.location ?? ''].some((f) => f.toLowerCase().includes(q)))
      );
    });
    return sortSessions(list, tab === 'upcoming' ? 'asc' : 'desc').map((s) => ({ s, phase: d.index!.phase.get(s.id)! }));
  }, [d.index, d.sessions, tab, search, doctor, from, to]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { upcoming: 0, past: 0, cancelled: 0, all: 0 };
    if (d.index) for (const p of d.index.phase.values()) for (const t of TABS) if (inTab(t.key, p)) c[t.key]++;
    return c;
  }, [d.index]);

  if (d.error) return <ErrorState error={d.error} onRetry={d.retry} />;
  const doctors = d.profiles.filter((p) => p.role === 'doctor' || p.role === 'admin');
  const edit = (s: Session | null) => {
    setEditing(s);
    setFormOpen(true);
  };

  function attendanceCell(s: Session, phase: SessionPhase) {
    const recs = d.index!.bySession.get(s.id) ?? [];
    if (phase === 'cancelled') return <span className="text-xs text-slate-400">Not counted</span>;
    const sum = rosterSummary(recs.map((r) => r.status));
    if (phase === 'upcoming') return <span className="text-xs text-slate-500">{sum.total} members</span>;
    if (sum.pending === sum.total) return <span className="text-xs font-medium text-amber-700">Not recorded</span>;
    const st = sessionStats(d.index!, s.id);
    return (
      <span className="text-xs text-slate-600">
        <strong className="text-ink">{sum.present + sum.late}</strong>/{sum.total} attended
        {phase === 'completed' && <span className="text-slate-400"> · {formatRate(st.rate, 0)}</span>}
        {sum.pending > 0 && <span className="text-amber-700"> · {sum.pending} pending</span>}
      </span>
    );
  }

  return (
    <>
      <PageHeader
        title="Sessions"
        description={perms.manageSessions ? 'Schedule sessions, change times, cancel and open attendance.' : 'Upcoming and past team sessions.'}
        actions={
          perms.manageSessions && (
            <Button icon={<Plus className="size-4" />} onClick={() => edit(null)}>
              Create session
            </Button>
          )
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={clsx('-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap', tab === t.key ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-ink')}
          >
            {t.label} <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-xs text-slate-500">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search sessions" className="md:w-64" />
        <div className="grid grid-cols-2 gap-2 md:flex">
          <input type="date" aria-label="From date" className="input md:w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" aria-label="To date" className="input md:w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <FilterSelect label="Doctor" value={doctor} onChange={setDoctor}>
          <option value="">All doctors</option>
          {doctors.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </FilterSelect>
        {(search || from || to || doctor) && (
          <Button variant="ghost" size="sm" onClick={() => (setSearch(''), setFrom(''), setTo(''), setDoctor(''))}>
            Clear filters
          </Button>
        )}
      </div>

      {d.isLoading ? (
        <Skeleton className="h-96" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays className="size-6" />}
            title="No sessions found"
            description={tab === 'upcoming' ? 'There are no upcoming sessions.' : 'No sessions match these filters.'}
            action={perms.manageSessions && tab === 'upcoming' && <Button icon={<Plus className="size-4" />} onClick={() => edit(null)}>Create session</Button>}
          />
        </Card>
      ) : (
        <div className="card overflow-visible">
          {/* Mobile list */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {rows.map(({ s, phase }) => (
              <li key={s.id} className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-ink">{s.title}</p>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {formatDate(s.session_date)} · {formatTimeRange(s.start_time, s.end_time)}
                  </p>
                  <p className="text-xs text-slate-500">{d.lookup.profileName(s.doctor_id)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <PhaseBadge phase={phase} />
                    {attendanceCell(s, phase)}
                  </div>
                </div>
                {perms.recordAttendance && (
                  <div className="flex flex-col items-end gap-1">
                    <Link to={`${base}/sessions/${s.id}`} className="rounded-lg bg-blue-50 p-2 text-primary" aria-label={`Open ${s.title}`}>
                      <ClipboardCheck className="size-4" />
                    </Link>
                    {perms.manageSessions && <RowMenu session={s} phase={phase} onEdit={() => edit(s)} />}
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <TableWrap>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Doctor</th>
                    <th>Status</th>
                    <th>Attendance</th>
                    {perms.recordAttendance && <th className="text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ s, phase }) => (
                    <tr key={s.id}>
                      <td className="max-w-72">
                        {perms.recordAttendance ? (
                          <Link to={`${base}/sessions/${s.id}`} className="font-semibold text-ink hover:text-primary">
                            {s.title}
                          </Link>
                        ) : (
                          <p className="font-semibold text-ink">{s.title}</p>
                        )}
                        <p className="flex items-center gap-1 truncate text-xs text-slate-500">
                          {s.team_group}
                          {s.location && (
                            <>
                              {' · '}
                              <MapPin className="size-3" /> {s.location}
                            </>
                          )}
                        </p>
                      </td>
                      <td className="whitespace-nowrap text-slate-600">{formatDate(s.session_date)}</td>
                      <td className="whitespace-nowrap text-slate-600">{formatTimeRange(s.start_time, s.end_time)}</td>
                      <td className="whitespace-nowrap text-slate-600">{d.lookup.profileName(s.doctor_id)}</td>
                      <td>
                        <PhaseBadge phase={phase} />
                      </td>
                      <td>{attendanceCell(s, phase)}</td>
                      {perms.recordAttendance && (
                        <td>
                          <div className="flex items-center justify-end gap-1">
                            <Link to={`${base}/sessions/${s.id}`} className={buttonClass(phase === 'active' ? 'primary' : 'secondary', 'sm')}>
                              <ClipboardCheck className="size-3.5" />
                              {phase === 'active' ? 'Take attendance' : 'Open'}
                            </Link>
                            {perms.manageSessions && <RowMenu session={s} phase={phase} onEdit={() => edit(s)} />}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        </div>
      )}

      {perms.manageSessions && <SessionFormModal open={formOpen} onClose={() => setFormOpen(false)} session={editing} />}
    </>
  );
}
