import { useEffect, useMemo, useState } from 'react';
import { Link, useBlocker, useParams } from 'react-router';
import {
  ArrowLeft, CalendarDays, CheckCheck, Clock, Download, Lock, MapPin, MessageSquarePlus, Pencil, Save, Stethoscope, Unlock, Users,
} from 'lucide-react';
import clsx from 'clsx';
import type { AttendanceStatus, TeamMember } from '@/types';
import { api, errorMessage } from '@/services';
import { ATTENDANCE_STATUSES, formatRate, rosterSummary, STATUS_META } from '@/lib/attendance';
import { formatLongDate, formatTimeRange } from '@/lib/dates';
import { buildSessionReport, downloadWorkbook, loadXLSX, sessionFileName } from '@/lib/excel';
import { ROLE_HOME } from '@/lib/permissions';
import { qk, useApiMutation, useAttendanceData, useCan } from '@/hooks/queries';
import { useMe } from '@/context/AuthContext';
import { AttendanceBadge, Avatar, Badge, EmptyState, ErrorState, PageLoader, PhaseBadge } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/Form';
import { Modal, useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { SessionFormModal } from './SessionFormModal';

type Draft = Record<string, { status: AttendanceStatus | null; notes: string | null }>;

const BTN: Record<AttendanceStatus, { on: string; off: string }> = {
  present: { on: 'bg-success text-white border-success', off: 'hover:border-green-400 hover:text-green-700' },
  absent: { on: 'bg-danger text-white border-danger', off: 'hover:border-red-400 hover:text-red-700' },
  late: { on: 'bg-warning text-ink border-warning', off: 'hover:border-amber-400 hover:text-amber-700' },
  excused: { on: 'bg-primary text-white border-primary', off: 'hover:border-blue-400 hover:text-blue-700' },
};
const KEYS: Record<string, AttendanceStatus> = { p: 'present', a: 'absent', l: 'late', e: 'excused' };

function SummaryPills({ s }: { s: ReturnType<typeof rosterSummary> }) {
  const items = [
    { label: 'Present', value: s.present, cls: 'bg-green-50 text-green-700 ring-green-600/20' },
    { label: 'Absent', value: s.absent, cls: 'bg-red-50 text-red-700 ring-red-600/20' },
    { label: 'Late', value: s.late, cls: 'bg-amber-50 text-amber-800 ring-amber-600/25' },
    { label: 'Excused', value: s.excused, cls: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  ];
  return (
    <div className="grid grid-cols-4 gap-2" data-testid="attendance-summary">
      {items.map((i) => (
        <div key={i.label} className={clsx('rounded-lg px-2 py-2 text-center ring-1 ring-inset', i.cls)}>
          <p className="text-xl font-bold tabular-nums">{i.value}</p>
          <p className="text-[11px] font-medium">{i.label}</p>
        </div>
      ))}
    </div>
  );
}

export function TakeAttendancePage() {
  const { id = '' } = useParams();
  const me = useMe();
  const base = ROLE_HOME[me.role];
  const perms = useCan();
  const toast = useToast();
  const confirm = useConfirm();
  const d = useAttendanceData();
  const [draft, setDraftState] = useState<Draft>({});
  /** true once the user changed something (defaults alone don't trigger the leave prompt) */
  const [touched, setTouched] = useState(false);
  const setDraft = (u: (d: Draft) => Draft) => {
    setTouched(true);
    setDraftState(u);
  };
  const [unlocked, setUnlocked] = useState(false);
  const [search, setSearch] = useState('');
  const [notesOpen, setNotesOpen] = useState<Record<string, boolean>>({});
  const [savedSummary, setSavedSummary] = useState<ReturnType<typeof rosterSummary> | null>(null);
  const [editSession, setEditSession] = useState(false);
  const [exporting, setExporting] = useState(false);

  const session = d.sessions.find((s) => s.id === id);
  const phase = session && d.index ? d.index.phase.get(session.id)! : null;
  const records = useMemo(() => (d.index?.bySession.get(id) ?? []), [d.index, id]);

  /** Roster: everyone with a record + any active member missing one. */
  const roster = useMemo(() => {
    if (!session) return [];
    const recByMember = new Map(records.map((r) => [r.team_member_id, r]));
    const members: TeamMember[] = [];
    for (const m of d.members) if (recByMember.has(m.id) || (m.status === 'active' && session.status !== 'cancelled' && phase !== 'completed')) members.push(m);
    return members
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .map((m) => ({ m, rec: recByMember.get(m.id) ?? null }));
  }, [session, records, d.members, phase]);

  const savedKey = records.map((r) => `${r.id}:${r.status}:${r.notes}`).join('|');
  const defaultPresent = phase === 'active' || phase === 'completed';

  // (Re)initialise the draft from saved data. Unrecorded members default to Present once the session has started.
  useEffect(() => {
    const next: Draft = {};
    for (const { m, rec } of roster) next[m.id] = { status: rec?.status ?? (defaultPresent ? 'present' : null), notes: rec?.notes ?? null };
    setDraftState(next);
    setTouched(false);
  }, [savedKey, roster.length, defaultPresent]);

  const changes = roster.filter(({ m, rec }) => {
    const dr = draft[m.id];
    return dr && (dr.status !== (rec?.status ?? null) || (dr.notes ?? null) !== (rec?.notes ?? null));
  });
  const dirty = changes.length > 0;
  const allRecorded = records.length > 0 && records.every((r) => r.status !== null);
  const locked = phase === 'cancelled' || (phase === 'completed' && allRecorded && !unlocked) || !perms.recordAttendance;
  const summary = rosterSummary(roster.map(({ m }) => draft[m.id]?.status ?? null));

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && touched && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    confirm({ title: 'Discard unsaved attendance?', message: `You have ${changes.length} unsaved change(s).`, confirmLabel: 'Discard' }).then((ok) => (ok ? blocker.proceed() : blocker.reset()));
  }, [blocker.state]);
  useEffect(() => {
    if (!dirty || !touched) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty, touched]);

  const save = useApiMutation(
    () => api.saveAttendance(id, changes.map(({ m }) => ({ team_member_id: m.id, status: draft[m.id].status, notes: draft[m.id].notes?.trim() || null }))),
    { invalidate: [qk.attendance], errorTitle: 'Could not save attendance' },
  );

  const setStatus = (memberId: string, status: AttendanceStatus) => setDraft((dr) => ({ ...dr, [memberId]: { ...dr[memberId], status } }));
  const markAllPresent = () =>
    setDraft((dr) => Object.fromEntries(Object.entries(dr).map(([k, v]) => [k, { ...v, status: 'present' as AttendanceStatus }])));

  function onSave() {
    const hadRecords = records.some((r) => r.status !== null);
    save.mutate(undefined, {
      onSuccess: () => {
        toast.success(hadRecords ? 'Attendance updated' : 'Attendance saved', `${changes.length} record(s) saved for ${session!.title}.`);
        setSavedSummary(summary);
        setUnlocked(false);
      },
    });
  }

  async function exportSession() {
    if (!session) return;
    setExporting(true);
    try {
      const X = await loadXLSX();
      const wb = buildSessionReport(X, { organization: d.settings?.organization_name ?? 'Team', members: d.members, sessions: d.sessions, records: d.attendance, specializations: d.specializations, profiles: d.profiles, threshold: d.threshold, period: {} }, session);
      await downloadWorkbook(wb, sessionFileName(session));
      toast.success('Excel export completed', sessionFileName(session));
    } catch (e) {
      toast.error('Export failed', errorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  if (d.error) return <ErrorState error={d.error} onRetry={d.retry} />;
  if (d.isLoading || !d.index) return <PageLoader label="Loading session…" />;
  if (!session || !phase) return <EmptyState title="Session not found" description="It may have been deleted." action={<Link className="text-primary hover:underline" to={`${base}/sessions`}>Back to sessions</Link>} />;

  const q = search.trim().toLowerCase();
  const visible = roster.filter(({ m }) => !q || m.full_name.toLowerCase().includes(q) || m.member_code.toLowerCase().includes(q) || d.lookup.specName(m.specialization_id).toLowerCase().includes(q));

  return (
    <div className="pb-24">
      <Link to={`${base}/sessions`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink">
        <ArrowLeft className="size-4" /> Sessions
      </Link>

      {/* Session info */}
      <div className="card mb-4 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-ink sm:text-2xl">{session.title}</h1>
              <PhaseBadge phase={phase} />
            </div>
            {session.description && <p className="mt-1 text-sm text-slate-500">{session.description}</p>}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4 text-slate-400" />{formatLongDate(session.session_date)}</span>
              <span className="inline-flex items-center gap-1.5"><Clock className="size-4 text-slate-400" />{formatTimeRange(session.start_time, session.end_time)}</span>
              <span className="inline-flex items-center gap-1.5"><Stethoscope className="size-4 text-slate-400" />{d.lookup.profileName(session.doctor_id)}</span>
              <span className="inline-flex items-center gap-1.5"><Users className="size-4 text-slate-400" />{session.team_group}</span>
              {session.location && <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-slate-400" />{session.location}</span>}
            </div>
            {session.notes && <p className="mt-2 text-sm text-slate-500 italic">Note: {session.notes}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {perms.exportReports && (
              <Button variant="secondary" size="sm" icon={<Download className="size-4" />} loading={exporting} onClick={exportSession}>
                Export
              </Button>
            )}
            {perms.manageSessions && (
              <Button variant="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditSession(true)}>
                Edit session
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {/* Notices */}
          {phase === 'cancelled' && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">This session was cancelled. Attendance cannot be recorded and it does not count towards attendance percentages.</div>
          )}
          {phase === 'upcoming' && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">This session hasn’t started yet. You can pre-mark members (e.g. Excused); it only counts once the session is completed.</div>
          )}
          {phase === 'completed' && allRecorded && !unlocked && perms.recordAttendance && (
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 sm:flex-row sm:items-center">
              <Lock className="size-4 shrink-0 text-slate-500" />
              <p className="flex-1">Attendance is locked because the session is completed.</p>
              <Button
                size="sm"
                variant="secondary"
                icon={<Unlock className="size-4" />}
                onClick={async () => (await confirm({ title: 'Edit completed attendance?', message: 'Changes will update attendance percentages and be recorded under your name.', confirmLabel: 'Edit attendance', tone: 'primary' })) && setUnlocked(true)}
              >
                Edit attendance
              </Button>
            </div>
          )}

          {/* Toolbar */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Find member" className="sm:w-64" />
            {!locked && (
              <Button variant="success" icon={<CheckCheck className="size-4" />} onClick={markAllPresent} className="sm:ml-auto">
                Mark all present
              </Button>
            )}
          </div>
          {!locked && <p className="hidden text-xs text-slate-400 sm:block">Tip: focus a row and press P, A, L or E.</p>}

          {/* Roster */}
          {roster.length === 0 ? (
            <div className="card">
              <EmptyState icon={<Users className="size-6" />} title="No members on this session" description="Add active team members to see them here." />
            </div>
          ) : (
            <ul className="card divide-y divide-slate-100 overflow-hidden" aria-label="Attendance roster">
              {visible.map(({ m, rec }) => {
                const dr = draft[m.id] ?? { status: null, notes: null };
                const changed = dr.status !== (rec?.status ?? null) || (dr.notes ?? null) !== (rec?.notes ?? null);
                return (
                  <li
                    key={m.id}
                    tabIndex={locked ? undefined : 0}
                    data-testid={`row-${m.member_code}`}
                    onKeyDown={(e) => {
                      const s = KEYS[e.key.toLowerCase()];
                      if (!locked && s && (e.target as HTMLElement).tagName !== 'INPUT') {
                        e.preventDefault();
                        setStatus(m.id, s);
                      }
                    }}
                    className={clsx('flex flex-col gap-3 px-4 py-3 outline-none focus-visible:bg-blue-50/60 sm:flex-row sm:items-center', changed && 'bg-amber-50/40')}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={m.full_name} src={m.avatar_url} size="sm" />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                          {m.full_name}
                          {m.status === 'inactive' && <Badge>Inactive</Badge>}
                          {changed && <span className="size-1.5 rounded-full bg-warning" title="Unsaved change" />}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {d.lookup.specName(m.specialization_id)} · <span className="font-mono">{m.member_code}</span>
                        </p>
                      </div>
                    </div>
                    {locked ? (
                      <div className="flex items-center gap-2">
                        {dr.notes && <span className="max-w-48 truncate text-xs text-slate-500">{dr.notes}</span>}
                        <AttendanceBadge status={rec?.status ?? null} />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="grid flex-1 grid-cols-4 gap-1.5 sm:flex-none" role="radiogroup" aria-label={`Attendance for ${m.full_name}`}>
                          {ATTENDANCE_STATUSES.map((s) => (
                            <button
                              key={s}
                              role="radio"
                              aria-checked={dr.status === s}
                              onClick={() => setStatus(m.id, s)}
                              title={STATUS_META[s].label}
                              className={clsx(
                                'h-10 rounded-lg border text-xs font-semibold transition-colors sm:w-[4.5rem]',
                                dr.status === s ? BTN[s].on : clsx('border-slate-200 bg-white text-slate-500', BTN[s].off),
                              )}
                            >
                              {STATUS_META[s].label}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setNotesOpen((n) => ({ ...n, [m.id]: !n[m.id] }))}
                          className={clsx('rounded-lg p-2', dr.notes ? 'text-primary' : 'text-slate-400 hover:text-slate-600')}
                          aria-label={`Note for ${m.full_name}`}
                          title="Add note"
                        >
                          <MessageSquarePlus className="size-4" />
                        </button>
                      </div>
                    )}
                    {!locked && (notesOpen[m.id] || dr.notes) && (
                      <input
                        className="input sm:basis-full"
                        placeholder="Note (e.g. medical excuse)"
                        maxLength={500}
                        value={dr.notes ?? ''}
                        onChange={(e) => setDraft((all) => ({ ...all, [m.id]: { ...all[m.id], notes: e.target.value || null } }))}
                      />
                    )}
                  </li>
                );
              })}
              {visible.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">No members match “{search}”.</li>}
            </ul>
          )}
        </div>

        {/* Summary */}
        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink">Attendance Summary</h2>
            <SummaryPills s={summary} />
            <div className="mt-3 flex justify-between text-sm text-slate-600">
              <span>{summary.total} members{summary.pending ? ` · ${summary.pending} not marked` : ''}</span>
              <span className="font-semibold text-ink">{formatRate(summary.rate)}</span>
            </div>
          </div>
        </aside>
      </div>

      {/* Sticky save bar */}
      {!locked && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur lg:left-64" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <p className="flex-1 text-sm text-slate-600">
              {dirty ? (
                <>
                  <strong className="text-ink">{changes.length}</strong> unsaved change{changes.length === 1 ? '' : 's'}
                </>
              ) : (
                'All changes saved'
              )}
            </p>
            {unlocked && !dirty && (
              <Button variant="ghost" onClick={() => setUnlocked(false)}>
                Lock
              </Button>
            )}
            <Button size="lg" icon={<Save className="size-4" />} disabled={!dirty} loading={save.isPending} onClick={onSave} data-testid="save-attendance">
              Save attendance
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={!!savedSummary}
        onClose={() => setSavedSummary(null)}
        size="sm"
        title="Attendance saved"
        description={`${session.title} · ${formatLongDate(session.session_date)}`}
        footer={
          <>
            {perms.exportReports && (
              <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportSession} loading={exporting}>
                Export Excel
              </Button>
            )}
            <Button onClick={() => setSavedSummary(null)} data-autofocus>
              Done
            </Button>
          </>
        }
      >
        {savedSummary && (
          <div className="space-y-3">
            <SummaryPills s={savedSummary} />
            <p className="text-center text-sm text-slate-600">
              Session attendance: <strong className="text-ink">{formatRate(savedSummary.rate)}</strong>
              {savedSummary.pending > 0 && ` · ${savedSummary.pending} not marked`}
            </p>
          </div>
        )}
      </Modal>

      {perms.manageSessions && <SessionFormModal open={editSession} onClose={() => setEditSession(false)} session={session} />}
    </div>
  );
}
