import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, Clock, History, Mail, Phone, ShieldCheck, XCircle } from 'lucide-react';
import type { TeamMember } from '@/types';
import { formatRate, memberStats, rateTone, sortSessions } from '@/lib/attendance';
import { formatDate, formatTimeRange } from '@/lib/dates';
import { useAttendanceData, useCan } from '@/hooks/queries';
import { useViewer } from '@/context/AuthContext';
import { AttendanceBadge, Avatar, Card, EmptyState, MemberStatusBadge, PhaseBadge, ProgressRing, StatCard, TableWrap } from '@/components/ui/Display';
import { FilterSelect } from '@/components/ui/Form';
import { StatusEditor } from './StatusEditor';

export function MemberAttendanceView({ member, data }: { member: TeamMember; data: ReturnType<typeof useAttendanceData> }) {
  const { base } = useViewer();
  const perms = useCan();
  const [status, setStatus] = useState('');
  const idx = data.index!;
  const stats = memberStats(idx, member.id);
  const tone = rateTone(stats.rate, data.threshold);

  const history = useMemo(() => {
    const recs = idx.byMember.get(member.id) ?? [];
    const withSession = recs
      .map((r) => ({ r, s: data.lookup.session(r.session_id)! }))
      .filter((x) => x.s && idx.phase.get(x.s.id) !== 'upcoming');
    const sorted = sortSessions(withSession.map((x) => ({ ...x.s, _r: x.r })), 'desc');
    return sorted
      .map((s) => ({ s, r: s._r, phase: idx.phase.get(s.id)! }))
      .filter((x) => !status || (status === 'none' ? x.r.status === null : x.r.status === status));
  }, [idx, member.id, data.lookup, status]);

  const msg =
    stats.rate === null
      ? 'No completed sessions yet.'
      : stats.rate >= data.threshold
        ? `Above the ${data.threshold}% attendance requirement.`
        : `Below the ${data.threshold}% attendance requirement.`;

  return (
    <div className="space-y-6">
      <div className="card flex flex-col gap-6 p-6 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Avatar name={member.full_name} src={member.avatar_url} size="xl" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-ink">{member.full_name}</h2>
              <MemberStatusBadge status={member.status} />
            </div>
            <p className="text-sm font-medium text-primary">{data.lookup.specName(member.specialization_id)}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
              <span className="font-mono">{member.member_code}</span>
              {member.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="size-3.5" /> {member.email}
                </span>
              )}
              {member.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3.5" /> {member.phone}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 md:border-l md:border-slate-100 md:pl-6">
          <ProgressRing value={stats.rate} tone={tone} label="Attendance" />
          <p className="max-w-40 text-sm text-slate-500">{msg}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Sessions" value={stats.sessions} icon={<History className="size-5" />} tone="indigo" hint="completed" />
        <StatCard label="Present" value={stats.present} icon={<CheckCircle2 className="size-5" />} tone="green" />
        <StatCard label="Absent" value={stats.absent} icon={<XCircle className="size-5" />} tone="red" />
        <StatCard label="Late" value={stats.late} icon={<Clock className="size-5" />} tone="amber" />
        <StatCard label="Excused" value={stats.excused} icon={<ShieldCheck className="size-5" />} tone="blue" hint={`Rate ${formatRate(stats.rate)}`} />
      </div>

      <Card
        title="Attendance history"
        bodyClassName="p-0"
        actions={
          <FilterSelect label="Filter by status" value={status} onChange={setStatus} className="h-8 py-0 text-xs">
            <option value="">All statuses</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="late">Late</option>
            <option value="excused">Excused</option>
            <option value="none">Not recorded</option>
          </FilterSelect>
        }
      >
        {history.length === 0 ? (
          <EmptyState title="No attendance records" description={status ? 'No records match this filter.' : 'Records appear after sessions take place.'} />
        ) : (
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Date</th>
                  <th className="hidden md:table-cell">Time</th>
                  <th>Status</th>
                  <th className="hidden md:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody>
                {history.map(({ s, r, phase }) => (
                  <tr key={r.id} className={phase === 'cancelled' ? 'opacity-60' : undefined}>
                    <td>
                      {perms.recordAttendance ? (
                        <Link to={`${base}/sessions/${s.id}`} className="font-medium text-ink hover:text-primary">
                          {s.title}
                        </Link>
                      ) : (
                        <span className="font-medium">{s.title}</span>
                      )}
                      {phase !== 'completed' && (
                        <span className="ml-2">
                          <PhaseBadge phase={phase} />
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-slate-600">{formatDate(s.session_date)}</td>
                    <td className="hidden whitespace-nowrap text-slate-500 md:table-cell">{formatTimeRange(s.start_time, s.end_time)}</td>
                    <td>{perms.recordAttendance && phase !== 'cancelled' ? <StatusEditor record={r} /> : <AttendanceBadge status={r.status} />}</td>
                    <td className="hidden max-w-60 truncate text-slate-500 md:table-cell">{r.notes ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
