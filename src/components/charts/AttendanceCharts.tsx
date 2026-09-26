import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { AttendanceCounts } from '@/lib/attendance';
import { EmptyState } from '@/components/ui/Display';
import { BarChart3 } from 'lucide-react';

const PRIMARY = '#2563EB';
const GRID = '#E2E8F0';
const AXIS = { fontSize: 12, fill: '#64748B' };

/** Order validated for colour-vision deficiency (see dataviz validator): green, blue, red, amber. */
const STATUS_SLICES = [
  { key: 'present', label: 'Present', color: '#16A34A' },
  { key: 'excused', label: 'Excused', color: '#2563EB' },
  { key: 'absent', label: 'Absent', color: '#DC2626' },
  { key: 'late', label: 'Late', color: '#F59E0B' },
] as const;

function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: { value: number; payload: Record<string, unknown> }[]; label?: string; format: (v: number, p: Record<string, unknown>) => string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-0.5 font-semibold text-ink">{(p.payload.tooltipTitle as string) ?? label}</p>
      <p className="text-slate-600">{format(p.value, p.payload)}</p>
    </div>
  );
}

const NoData = () => <EmptyState icon={<BarChart3 className="size-6" />} title="No completed sessions yet" description="Charts appear once attendance is recorded for completed sessions." />;

export function MemberRateChart({ data, threshold }: { data: { name: string; rate: number; sessions: number }[]; threshold: number }) {
  if (!data.length) return <NoData />;
  const height = Math.max(220, data.length * 30 + 40);
  return (
    <div style={{ height }} role="img" aria-label="Attendance percentage by member">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={118} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: '#F1F5F9' }} content={<ChartTooltip format={(v, p) => `${v.toFixed(1)}% attendance · ${p.sessions} sessions`} />} />
          <ReferenceLine x={threshold} stroke="#94A3B8" strokeDasharray="4 4" label={{ value: `${threshold}%`, position: 'top', fontSize: 11, fill: '#64748B' }} />
          <Bar dataKey="rate" fill={PRIMARY} radius={[0, 4, 4, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusDonut({ counts }: { counts: Pick<AttendanceCounts, 'present' | 'absent' | 'late' | 'excused'> }) {
  const data = STATUS_SLICES.map((s) => ({ ...s, value: counts[s.key], tooltipTitle: s.label }));
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!total) return <NoData />;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
      <div className="relative h-48 w-48 shrink-0" role="img" aria-label="Attendance status distribution">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="100%" stroke="#fff" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip format={(v) => `${v} marks · ${((v / total) * 100).toFixed(1)}%`} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-ink tabular-nums">{total}</span>
          <span className="text-xs text-slate-500">marks</span>
        </div>
      </div>
      {/* Legend with direct labels: identity never relies on colour alone */}
      <ul className="grid w-full max-w-xs grid-cols-2 gap-2 sm:grid-cols-1">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2 text-sm">
            <span className="size-3 shrink-0 rounded-sm" style={{ background: d.color }} aria-hidden />
            <span className="text-slate-600">{d.label}</span>
            <span className="ml-auto font-semibold text-ink tabular-nums">{d.value}</span>
            <span className="w-12 text-right text-xs text-slate-400 tabular-nums">{((d.value / total) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RateOverTimeChart({ data, threshold }: { data: { label: string; rate: number; tooltipTitle: string }[]; threshold: number }) {
  if (!data.length) return <NoData />;
  return (
    <div className="h-64" role="img" aria-label="Attendance percentage over time">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS} axisLine={false} tickLine={false} />
          <ReferenceLine y={threshold} stroke="#94A3B8" strokeDasharray="4 4" />
          <Tooltip cursor={{ stroke: '#94A3B8', strokeWidth: 1 }} content={<ChartTooltip format={(v) => `${v.toFixed(1)}% attendance`} />} />
          <Line type="monotone" dataKey="rate" stroke={PRIMARY} strokeWidth={2} dot={{ r: 4, fill: PRIMARY, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} animationDuration={500} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SpecializationChart({ data, threshold }: { data: { name: string; rate: number; members: number }[]; threshold: number }) {
  if (!data.length) return <NoData />;
  return (
    <div style={{ height: Math.max(220, data.length * 32 + 40) }} role="img" aria-label="Attendance percentage by specialization">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={138} tick={AXIS} axisLine={false} tickLine={false} />
          <ReferenceLine x={threshold} stroke="#94A3B8" strokeDasharray="4 4" label={{ value: `${threshold}%`, position: 'top', fontSize: 11, fill: '#64748B' }} />
          <Tooltip cursor={{ fill: '#F1F5F9' }} content={<ChartTooltip format={(v, p) => `${v.toFixed(1)}% attendance · ${p.members} member${p.members === 1 ? '' : 's'}`} />} />
          <Bar dataKey="rate" fill={PRIMARY} radius={[0, 4, 4, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
