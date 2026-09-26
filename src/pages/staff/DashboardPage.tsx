import { useMemo } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, CalendarCheck2, CheckCircle2, ChevronRight, Clock, Percent, Users, XCircle } from 'lucide-react';
import { useViewer } from '@/context/AuthContext';
import { useAttendanceData, useCan } from '@/hooks/queries';
import { formatRate, memberStats, overview, rateBySpecialization, rateOverTime, rateTone, sortSessions } from '@/lib/attendance';
import { formatDate, formatTimeRange, MONTHS } from '@/lib/dates';
import { MemberRateChart, RateOverTimeChart, SpecializationChart, StatusDonut } from '@/components/charts/AttendanceCharts';
import { Avatar, Card, EmptyState, ErrorState, PageHeader, PhaseBadge, RateBar, Skeleton, StatCard } from '@/components/ui/Display';

export function DashboardPage() {
  const { role, base, profile } = useViewer();
  const perms = useCan();
  const d = useAttendanceData();

  const derived = useMemo(() => {
    if (!d.index) return null;
    const idx = d.index;
    const ov = overview(idx, d.members.filter((m) => m.status === 'active'), d.sessions);
    const memberRates = d.members
      .filter((m) => m.status === 'active')
      .map((m) => ({ m, stats: memberStats(idx, m.id) }))
      .filter((x) => x.stats.rate !== null)
      .sort((a, b) => b.stats.rate! - a.stats.rate!);
    const pendingSessions = sortSessions(
      d.sessions.filter((s) => {
        const phase = idx.phase.get(s.id);
        return (phase === 'active' || phase === 'completed') && (idx.bySession.get(s.id) ?? []).some((r) => r.status === null);
      }),
      'desc',
    ).slice(0, 4);
    const upcoming = sortSessions(d.sessions.filter((s) => ['upcoming', 'active'].includes(idx.phase.get(s.id)!))).slice(0, 5);
    return { idx, ov, memberRates, pendingSessions, upcoming };
  }, [d.index, d.members, d.sessions]);

  if (d.error) return <ErrorState error={d.error} onRetry={d.retry} />;

  return (
    <>
      <PageHeader
        title={role === 'admin' ? 'Admin Dashboard' : role === 'doctor' ? 'Doctor Dashboard' : (d.settings?.organization_name ?? 'Team Attendance')}
        description={profile ? `Welcome back, ${profile.full_name}. Here is the team’s attendance at a glance.` : 'Team attendance at a glance — view only.'}
      />

      {!derived ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[76px]" />
          ))}
          <Skeleton className="col-span-full h-72" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
            <StatCard label="Team Members" value={derived.ov.activeMembers} icon={<Users className="size-5" />} tone="blue" hint={`${d.members.length - derived.ov.activeMembers} inactive`} />
            <StatCard label="Total Sessions" value={derived.ov.totalSessions} icon={<CalendarCheck2 className="size-5" />} tone="indigo" hint={`${derived.ov.completedSessions} completed · ${derived.ov.upcomingSessions} upcoming`} />
            <StatCard label="Total Present" value={derived.ov.present} icon={<CheckCircle2 className="size-5" />} tone="green" />
            <StatCard label="Total Absent" value={derived.ov.absent} icon={<XCircle className="size-5" />} tone="red" />
            <StatCard label="Total Late" value={derived.ov.late} icon={<Clock className="size-5" />} tone="amber" hint={`${derived.ov.excused} excused`} />
            <StatCard label="Average Attendance" value={formatRate(derived.ov.rate)} icon={<Percent className="size-5" />} tone="blue" hint="(Present + Late) ÷ counted" />
          </div>

          {perms.recordAttendance && derived.pendingSessions.length > 0 && (
            <div className="card flex flex-col gap-3 border-amber-200 bg-amber-50/60 p-4 sm:flex-row sm:items-center">
              <AlertTriangle className="size-5 shrink-0 text-warning" aria-hidden />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-amber-900">Attendance not recorded</p>
                <p className="text-amber-800">
                  {derived.pendingSessions.map((s) => `${s.title} (${formatDate(s.session_date)})`).join(', ')}
                </p>
              </div>
              <Link to={`${base}/sessions/${derived.pendingSessions[0].id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                Take attendance <ChevronRight className="size-4" />
              </Link>
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-5">
            <Card title="Attendance over time" className="xl:col-span-3">
              <RateOverTimeChart
                threshold={d.threshold}
                data={rateOverTime(derived.idx).map(({ session, stats }) => ({
                  label: formatDate(session.session_date).slice(0, 5),
                  rate: stats.rate!,
                  tooltipTitle: `${session.title} · ${formatDate(session.session_date)}`,
                }))}
              />
            </Card>
            <Card title="Attendance status" className="xl:col-span-2">
              <StatusDonut counts={derived.ov} />
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Attendance by member">
              <MemberRateChart threshold={d.threshold} data={derived.memberRates.map((x) => ({ name: x.m.full_name, rate: x.stats.rate!, sessions: x.stats.sessions }))} />
            </Card>
            <Card title="Attendance by specialization">
              <SpecializationChart
                threshold={d.threshold}
                data={rateBySpecialization(derived.idx, d.members, d.specializations).map((x) => ({ name: x.specialization.name, rate: x.stats.rate ?? 0, members: x.members }))}
              />
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Upcoming sessions" actions={<Link to={`${base}/sessions`} className="text-sm font-medium text-primary hover:underline">View all</Link>} bodyClassName="p-0">
              {derived.upcoming.length === 0 ? (
                <EmptyState title="No upcoming sessions" description="Scheduled sessions will appear here." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {derived.upcoming.map((s) => (
                    <li key={s.id}>
                      <Link to={perms.recordAttendance ? `${base}/sessions/${s.id}` : `${base}/sessions`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                        <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-blue-50 text-primary">
                          <span className="text-[10px] font-semibold uppercase">{MONTHS[Number(s.session_date.slice(5, 7)) - 1].slice(0, 3)}</span>
                          <span className="text-base leading-none font-bold">{s.session_date.slice(8, 10)}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink">{s.title}</p>
                          <p className="truncate text-xs text-slate-500">
                            {formatTimeRange(s.start_time, s.end_time)} · {d.lookup.profileName(s.doctor_id)}
                          </p>
                        </div>
                        <PhaseBadge phase={derived.idx.phase.get(s.id)!} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title={`Members below ${d.threshold}%`} actions={perms.exportReports && <Link to={`${base}/reports?below=1`} className="text-sm font-medium text-primary hover:underline">Report</Link>} bodyClassName="p-0">
              {(() => {
                const low = derived.memberRates.filter((x) => x.stats.rate! < d.threshold).reverse();
                if (!low.length) return <EmptyState icon={<CheckCircle2 className="size-6 text-success" />} title="Everyone is above the threshold" description={`All active members have at least ${d.threshold}% attendance.`} />;
                return (
                  <ul className="divide-y divide-slate-100">
                    {low.map(({ m, stats }) => (
                      <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                        <Avatar name={m.full_name} src={m.avatar_url} size="sm" />
                        <div className="min-w-0 flex-1">
                          <Link to={`${base}/members/${m.id}`} className="block truncate text-sm font-semibold text-ink hover:text-primary">
                            {m.full_name}
                          </Link>
                          <p className="truncate text-xs text-slate-500">
                            {d.lookup.specName(m.specialization_id)} · {stats.absent} absent
                          </p>
                        </div>
                        <RateBar value={stats.rate} tone={rateTone(stats.rate, d.threshold)} />
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
