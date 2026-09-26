import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { FileSpreadsheet, Filter, TableProperties, TrendingDown, UserX } from 'lucide-react';
import clsx from 'clsx';
import type { AttendanceStatus } from '@/types';
import { errorMessage } from '@/services';
import { ATTENDANCE_STATUSES, countStatuses, formatRate, rateTone, sortSessions, STATUS_META } from '@/lib/attendance';
import { formatDate, monthRange } from '@/lib/dates';
import { buildAttendanceMatrix, buildRecordsReport, downloadWorkbook, loadXLSX, reportFileName, type ReportData } from '@/lib/excel';
import { ROLE_HOME } from '@/lib/permissions';
import { useAttendanceData } from '@/hooks/queries';
import { useMe } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { AttendanceBadge, Card, EmptyState, ErrorState, PageHeader, RateBar, Skeleton, StatCard, TableWrap } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { FilterSelect } from '@/components/ui/Form';

type View = 'members' | 'records';

export function ReportsPage() {
  const me = useMe();
  const base = ROLE_HOME[me.role];
  const toast = useToast();
  const d = useAttendanceData();
  const [params] = useSearchParams();
  const [view, setView] = useState<View>('members');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [specId, setSpecId] = useState('');
  const [status, setStatus] = useState<AttendanceStatus | ''>('');
  const [below, setBelow] = useState(params.get('below') === '1');
  const [exporting, setExporting] = useState<'' | 'matrix' | 'records'>('');

  const r = useMemo(() => {
    if (!d.index) return null;
    const idx = d.index;
    // Only completed sessions count (cancelled/upcoming never do).
    const sessions = idx.countedSessions.filter((s) => (!from || s.session_date >= from) && (!to || s.session_date <= to) && (!sessionId || s.id === sessionId));
    const sessionIds = new Set(sessions.map((s) => s.id));
    const records = d.attendance.filter((a) => sessionIds.has(a.session_id));
    const baseMembers = d.members.filter((m) => (!memberId || m.id === memberId) && (!specId || m.specialization_id === specId));
    const summaries = baseMembers
      .map((m) => {
        const recs = records.filter((a) => a.team_member_id === m.id);
        return { m, stats: countStatuses(recs.map((a) => a.status)) };
      })
      .filter((x) => x.stats.sessions > 0 || (!!memberId && x.m.id === memberId))
      .filter((x) => !status || x.stats[status] > 0)
      .filter((x) => !below || (x.stats.rate !== null && x.stats.rate < d.threshold))
      .sort((a, b) => (a.stats.rate ?? 101) - (b.stats.rate ?? 101));
    const memberIds = new Set(summaries.map((x) => x.m.id));
    const filteredRecords = records.filter((a) => a.status !== null && memberIds.has(a.team_member_id) && (!status || a.status === status));
    const totals = countStatuses(filteredRecords.map((a) => a.status));
    return { sessions, summaries, filteredRecords, totals, members: summaries.map((x) => x.m) };
  }, [d.index, d.attendance, d.members, d.threshold, from, to, sessionId, memberId, specId, status, below]);

  if (d.error) return <ErrorState error={d.error} onRetry={d.retry} />;

  const today = d.now.slice(0, 10);
  const month = monthRange(today);
  const clear = () => (setFrom(''), setTo(''), setSessionId(''), setMemberId(''), setSpecId(''), setStatus(''), setBelow(false));
  const presets = [
    { label: 'Absences this month', icon: UserX, apply: () => (clear(), setFrom(month.from), setTo(month.to), setStatus('absent'), setView('records')) },
    { label: 'This month', icon: Filter, apply: () => (clear(), setFrom(month.from), setTo(month.to)) },
    { label: `Below ${d.threshold}%`, icon: TrendingDown, apply: () => (clear(), setBelow(true), setView('members')) },
  ];

  const filterDescription = [
    sessionId && `session: ${d.lookup.session(sessionId)?.title}`,
    memberId && `member: ${d.lookup.member(memberId)?.full_name}`,
    specId && `specialization: ${d.lookup.specName(specId)}`,
    status && `status: ${STATUS_META[status].label}`,
    below && `below ${d.threshold}%`,
  ].filter(Boolean).join(', ');

  async function exportReport(kind: 'matrix' | 'records') {
    if (!r) return;
    if (!r.sessions.length) return toast.warning('Nothing to export', 'No completed sessions match the filters.');
    setExporting(kind);
    try {
      const sorted = sortSessions(r.sessions);
      // Name/label by the explicit range, or by the span of the included sessions.
      const period = { from: from || sorted[0].session_date, to: to || sorted.at(-1)!.session_date };
      const data: ReportData = {
        organization: d.settings?.organization_name ?? 'Team',
        members: r.members,
        sessions: sorted,
        records: kind === 'records' ? r.filteredRecords : d.attendance,
        specializations: d.specializations,
        profiles: d.profiles,
        threshold: d.threshold,
        period,
      };
      const X = await loadXLSX();
      const wb = kind === 'matrix' ? buildAttendanceMatrix(X, data) : buildRecordsReport(X, data, filterDescription);
      const name = reportFileName(kind === 'matrix' ? 'Team_Attendance_Report' : 'Attendance_Records', period, today);
      await downloadWorkbook(wb, name);
      toast.success('Excel export completed', name);
    } catch (e) {
      toast.error('Export failed', errorMessage(e));
    } finally {
      setExporting('');
    }
  }

  return (
    <>
      <PageHeader
        title="Reports"
        description="Filter attendance and export professional Excel reports."
        actions={
          <>
            <Button variant="secondary" icon={<TableProperties className="size-4" />} loading={exporting === 'records'} onClick={() => exportReport('records')}>
              Export records
            </Button>
            <Button icon={<FileSpreadsheet className="size-4" />} loading={exporting === 'matrix'} onClick={() => exportReport('matrix')}>
              Export attendance
            </Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {presets.map((p) => (
          <button key={p.label} onClick={p.apply} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-primary hover:text-primary">
            <p.icon className="size-3.5" /> {p.label}
          </button>
        ))}
      </div>

      <Card className="mb-4" bodyClassName="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <label className="text-xs font-medium text-slate-500">
            From
            <input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-xs font-medium text-slate-500">
            To
            <input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Session
            <FilterSelect label="Session" value={sessionId} onChange={setSessionId} className="mt-1 w-full">
              <option value="">All sessions</option>
              {sortSessions(d.index?.countedSessions ?? [], 'desc').map((s) => (
                <option key={s.id} value={s.id}>{formatDate(s.session_date)} — {s.title}</option>
              ))}
            </FilterSelect>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Team member
            <FilterSelect label="Team member" value={memberId} onChange={setMemberId} className="mt-1 w-full">
              <option value="">All members</option>
              {d.members.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name}{m.status === 'inactive' ? ' (inactive)' : ''}</option>
              ))}
            </FilterSelect>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Specialization
            <FilterSelect label="Specialization" value={specId} onChange={setSpecId} className="mt-1 w-full">
              <option value="">All specializations</option>
              {d.specializations.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </FilterSelect>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Status
            <FilterSelect label="Status" value={status} onChange={(v) => setStatus(v as AttendanceStatus | '')} className="mt-1 w-full">
              <option value="">All statuses</option>
              {ATTENDANCE_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </FilterSelect>
          </label>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="size-4 accent-primary" checked={below} onChange={(e) => setBelow(e.target.checked)} />
              Below {d.threshold}%
            </label>
            <Button variant="ghost" size="sm" onClick={clear}>Clear all</Button>
          </div>
        </div>
      </Card>

      {!r ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Sessions" value={r.sessions.length} icon={<FileSpreadsheet className="size-5" />} tone="indigo" />
            <StatCard label="Present" value={r.totals.present} icon={<span className="text-sm font-bold">P</span>} tone="green" />
            <StatCard label="Absent" value={r.totals.absent} icon={<span className="text-sm font-bold">A</span>} tone="red" />
            <StatCard label="Late" value={r.totals.late} icon={<span className="text-sm font-bold">L</span>} tone="amber" hint={`${r.totals.excused} excused`} />
            <StatCard label="Attendance" value={formatRate(r.totals.rate)} icon={<span className="text-sm font-bold">%</span>} tone="blue" />
          </div>

          <div className="mb-3 inline-flex rounded-lg border border-slate-300 bg-white p-0.5" role="tablist">
            {(['members', 'records'] as const).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={clsx('rounded-md px-3 py-1.5 text-sm font-medium', view === v ? 'bg-primary text-white' : 'text-slate-600 hover:text-ink')}>
                {v === 'members' ? `Member summary (${r.summaries.length})` : `Records (${r.filteredRecords.length})`}
              </button>
            ))}
          </div>

          {view === 'members' ? (
            r.summaries.length === 0 ? (
              <Card><EmptyState title="No members match" description="Adjust the filters to see results." /></Card>
            ) : (
              <div className="card overflow-hidden">
                <TableWrap>
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th className="hidden md:table-cell">Specialization</th>
                        <th className="text-center">Sessions</th>
                        <th className="text-center">P</th>
                        <th className="text-center">A</th>
                        <th className="text-center">L</th>
                        <th className="text-center">E</th>
                        <th>Attendance %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.summaries.map(({ m, stats }) => (
                        <tr key={m.id}>
                          <td className="font-mono text-xs text-slate-600">{m.member_code}</td>
                          <td>
                            <Link to={`${base}/members/${m.id}`} className="font-medium text-ink hover:text-primary">{m.full_name}</Link>
                            {m.status === 'inactive' && <span className="ml-1.5 text-xs text-slate-400">(inactive)</span>}
                          </td>
                          <td className="hidden text-slate-600 md:table-cell">{d.lookup.specName(m.specialization_id)}</td>
                          <td className="text-center tabular-nums">{stats.sessions}</td>
                          <td className="text-center text-green-700 tabular-nums">{stats.present}</td>
                          <td className="text-center text-red-700 tabular-nums">{stats.absent}</td>
                          <td className="text-center text-amber-700 tabular-nums">{stats.late}</td>
                          <td className="text-center text-blue-700 tabular-nums">{stats.excused}</td>
                          <td><RateBar value={stats.rate} tone={rateTone(stats.rate, d.threshold)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              </div>
            )
          ) : r.filteredRecords.length === 0 ? (
            <Card><EmptyState title="No records match" description="Adjust the filters to see results." /></Card>
          ) : (
            <div className="card overflow-hidden">
              <TableWrap>
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Session</th>
                      <th>Member</th>
                      <th className="hidden md:table-cell">Specialization</th>
                      <th>Status</th>
                      <th className="hidden lg:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.filteredRecords
                      .map((a) => ({ a, s: d.lookup.session(a.session_id)!, m: d.lookup.member(a.team_member_id)! }))
                      .sort((x, y) => y.s.session_date.localeCompare(x.s.session_date) || x.m.full_name.localeCompare(y.m.full_name))
                      .slice(0, 300)
                      .map(({ a, s, m }) => (
                        <tr key={a.id}>
                          <td className="whitespace-nowrap text-slate-600">{formatDate(s.session_date)}</td>
                          <td className="max-w-56 truncate">{s.title}</td>
                          <td className="font-medium">{m.full_name}</td>
                          <td className="hidden text-slate-600 md:table-cell">{d.lookup.specName(m.specialization_id)}</td>
                          <td><AttendanceBadge status={a.status} /></td>
                          <td className="hidden max-w-60 truncate text-slate-500 lg:table-cell">{a.notes}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </TableWrap>
              {r.filteredRecords.length > 300 && <p className="border-t border-slate-100 p-3 text-center text-xs text-slate-500">Showing 300 of {r.filteredRecords.length} — export to Excel for the full list.</p>}
            </div>
          )}
        </>
      )}
    </>
  );
}
