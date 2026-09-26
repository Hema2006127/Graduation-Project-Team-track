import type { AttendanceRecord, AttendanceStatus } from '@/types';
import { api } from '@/services';
import { ATTENDANCE_STATUSES, STATUS_META } from '@/lib/attendance';
import { qk, useApiMutation } from '@/hooks/queries';

/** Inline correction of a single record (staff only; enforced server-side too). */
export function StatusEditor({ record, disabled }: { record: AttendanceRecord; disabled?: boolean }) {
  const save = useApiMutation(
    (status: AttendanceStatus | null) =>
      api.saveAttendance(record.session_id, [{ team_member_id: record.team_member_id, status, notes: record.notes }]),
    { invalidate: [qk.attendance], success: 'Attendance updated', errorTitle: 'Could not update attendance' },
  );
  return (
    <select
      aria-label="Attendance status"
      value={record.status ?? ''}
      disabled={disabled || save.isPending}
      onChange={(e) => save.mutate((e.target.value || null) as AttendanceStatus | null)}
      className="input h-8 w-auto py-0 pr-7 text-xs"
    >
      <option value="">Not recorded</option>
      {ATTENDANCE_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_META[s].emoji} {STATUS_META[s].label}
        </option>
      ))}
    </select>
  );
}
