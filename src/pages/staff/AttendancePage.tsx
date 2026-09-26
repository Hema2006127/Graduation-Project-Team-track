import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ClipboardList } from 'lucide-react';
import { sortSessions } from '@/lib/attendance';
import { formatDate, formatDateTime } from '@/lib/dates';
import { ROLE_HOME } from '@/lib/permissions';
import { useAttendanceData } from '@/hooks/queries';
import { useMe } from '@/context/AuthContext';
import { StatusEditor } from '@/components/attendance/StatusEditor';
import { Avatar, Card, EmptyState, ErrorState, PageHeader, PhaseBadge, Skeleton, TableWrap } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { FilterSelect, SearchInput } from '@/components/ui/Form';

const PAGE = 50;

/** Every attendance record (staff). Records can be corrected inline. */
export function AttendancePage() {
  const me = useMe();
  const base = ROLE_HOME[me.role];
  const d = useAttendanceData();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const pastSessions = useMemo(
    () => (d.index ? sortSessions(d.sessions.filter((s) => d.index!.phase.get(s.id) !== 'upcoming'), 'desc') : []),
    [d.index, d.sessions],
  );

  const rows = useMemo(() => {
    if (!d.index) return [];
    const q = search.trim().toLowerCase();
    const order = new Map(pastSessions.map((s, i) => [s.id, i]));
    return d.attendance
      .filter((r) => order.has(r.session_id))
      .map((r) => ({ r, s: d.lookup.session(r.session_id)!, m: d.lookup.member(r.team_member_id) }))
      .filter(({ r, s, m }) =>
        m &&
        (!sessionId || s.id === sessionId) &&
        (!from || s.session_date >= from) &&
        (!to || s.session_date <= to) &&
        (!status || (status === 'none' ? r.status === null : r.status === status)) &&
        (!q || [m.full_name, m.member_code, s.title, d.lookup.specName(m.specialization_id)].some((f) => f.toLowerCase().includes(q))),
      )
      .sort((a, b) => order.get(a.s.id)! - order.get(b.s.id)! || a.m!.full_name.localeCompare(b.m!.full_name));
  }, [d.index, d.attendance, d.lookup, pastSessions, search, status, sessionId, from, to]);

  if (d.error) return <ErrorState error={d.error} onRetry={d.retry} />;
  const filtered = !!(search || status || sessionId || from || to);

  return (
    <>
      <PageHeader title={me.role === 'admin' ? 'Attendance' : 'Attendance History'} description="All attendance records. Change a status to correct a record — the change is saved immediately." />
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <SearchInput value={search} onChange={(v) => (setSearch(v), setLimit(PAGE))} placeholder="Search member, ID or session" className="lg:w-72" />
        <div className="grid grid-cols-2 gap-2 lg:flex">
          <FilterSelect label="Status" value={status} onChange={(v) => (setStatus(v), setLimit(PAGE))}>
            <option value="">All statuses</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="late">Late</option>
            <option value="excused">Excused</option>
            <option value="none">Not recorded</option>
          </FilterSelect>
          <FilterSelect label="Session" value={sessionId} onChange={(v) => (setSessionId(v), setLimit(PAGE))} className="lg:max-w-60">
            <option value="">All sessions</option>
            {pastSessions.map((s) => (
              <option key={s.id} value={s.id}>
                {formatDate(s.session_date)} — {s.title}
              </option>
            ))}
          </FilterSelect>
          <input type="date" aria-label="From date" className="input lg:w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" aria-label="To date" className="input lg:w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => (setSearch(''), setStatus(''), setSessionId(''), setFrom(''), setTo(''))}>
            Clear filters
          </Button>
        )}
      </div>

      {d.isLoading ? (
        <Skeleton className="h-96" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={<ClipboardList className="size-6" />} title="No attendance records" description={filtered ? 'No records match these filters.' : 'Records appear once sessions take place.'} />
        </Card>
      ) : (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            {rows.length} record{rows.length === 1 ? '' : 's'}
          </div>
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Session</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th className="hidden xl:table-cell">Recorded</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map(({ r, s, m }) => {
                  const phase = d.index!.phase.get(s.id)!;
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={m!.full_name} src={m!.avatar_url} size="sm" />
                          <div className="min-w-0">
                            <Link to={`${base}/members/${m!.id}`} className="block truncate font-medium text-ink hover:text-primary">{m!.full_name}</Link>
                            <p className="truncate text-xs text-slate-500">{d.lookup.specName(m!.specialization_id)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-64">
                        <Link to={`${base}/sessions/${s.id}`} className="block truncate text-slate-700 hover:text-primary">{s.title}</Link>
                        {phase !== 'completed' && <PhaseBadge phase={phase} />}
                      </td>
                      <td className="whitespace-nowrap text-slate-600">{formatDate(s.session_date)}</td>
                      <td>
                        <StatusEditor record={r} disabled={phase === 'cancelled'} />
                      </td>
                      <td className="hidden text-xs whitespace-nowrap text-slate-500 xl:table-cell">
                        {r.recorded_at ? `${d.lookup.profileName(r.recorded_by)} · ${formatDateTime(r.recorded_at)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
          {rows.length > limit && (
            <div className="border-t border-slate-100 p-3 text-center">
              <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                Show more ({rows.length - limit} remaining)
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
