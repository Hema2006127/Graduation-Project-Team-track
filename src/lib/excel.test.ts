import { describe, expect, it } from 'vitest';
import { buildSeedDb } from '@/services/demo/demoApi';
import { buildIndex } from './attendance';
import { nowKey } from './dates';
import { buildAttendanceMatrix, buildRecordsReport, buildSessionReport, buildTasksReport, loadXLSX, reportFileName, tasksFileName, type ReportData } from './excel';

const db = buildSeedDb();
const idx = buildIndex(db.sessions, db.attendance, nowKey('Africa/Cairo'));
const data: ReportData = {
  organization: 'Test Team',
  members: db.members,
  sessions: idx.countedSessions,
  records: db.attendance,
  specializations: db.specializations,
  profiles: db.accounts,
  threshold: 75,
  period: { from: '2026-09-01', to: '2026-09-30' },
};

describe('reportFileName', () => {
  it('uses the month name for a single-month period', () => {
    expect(reportFileName('Team_Attendance_Report', { from: '2026-09-01', to: '2026-09-30' }, '2026-09-27')).toBe('Team_Attendance_Report_September_2026.xlsx');
  });
  it('uses a month range across months', () => {
    expect(reportFileName('Team_Attendance_Report', { from: '2026-08-02', to: '2026-09-25' }, '2026-09-27')).toBe('Team_Attendance_Report_Aug_2026_to_Sep_2026.xlsx');
  });
});

describe('attendance matrix workbook', async () => {
  const X = await loadXLSX();
  const wb = buildAttendanceMatrix(X, data);
  // Round-trip through a real .xlsx file.
  const parsed = X.read(X.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });

  it('has Attendance, Summary and Sessions sheets', () => {
    expect(parsed.SheetNames).toEqual(['Attendance', 'Summary', 'Sessions']);
  });

  const ws = parsed.Sheets.Attendance;
  const rows = X.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '' });
  const header = rows[3];

  it('has the required columns', () => {
    expect(header.slice(0, 3)).toEqual(['Member ID', 'Name', 'Specialization']);
    expect(String(header[3])).toMatch(/^Session 1\n\d{2}\/\d{2}\/\d{4}$/);
    expect(header.slice(-5)).toEqual(['Present', 'Absent', 'Late', 'Excused', 'Attendance %']);
    expect(header.length).toBe(3 + idx.countedSessions.length + 5);
  });

  it('uses P/A/L/E codes and totals that add up', () => {
    const first = rows[4];
    const marks = first.slice(3, 3 + idx.countedSessions.length);
    expect(marks.every((m) => ['P', 'A', 'L', 'E', '–'].includes(String(m)))).toBe(true);
    const [p, a, l, e] = first.slice(-5, -1).map(Number);
    expect(p).toBe(marks.filter((m) => m === 'P').length);
    expect(a).toBe(marks.filter((m) => m === 'A').length);
    expect(l).toBe(marks.filter((m) => m === 'L').length);
    expect(e).toBe(marks.filter((m) => m === 'E').length);
    expect(Number(first.at(-1))).toBeCloseTo((p + l) / (p + l + a), 6);
  });

  it('formats percentages, adds an auto-filter and column widths', () => {
    const pctCell = wb.Sheets.Attendance[X.utils.encode_cell({ r: 4, c: header.length - 1 })];
    expect(pctCell.z).toBe('0.0%');
    expect(wb.Sheets.Attendance['!autofilter']?.ref).toMatch(/^A4:/);
    expect(wb.Sheets.Attendance['!cols']?.length).toBe(header.length);
  });

  it('writes real Excel dates on the Sessions sheet', () => {
    const cell = wb.Sheets.Sessions['C3'];
    expect(cell.t).toBe('n');
    expect(cell.z).toBe('dd/mm/yyyy');
  });
});

describe('session and records workbooks', async () => {
  const X = await loadXLSX();
  it('session report lists every rostered member with a status', () => {
    const session = idx.countedSessions.at(-2)!;
    const wb = buildSessionReport(X, data, session);
    const rows = X.utils.sheet_to_json<string[]>(wb.Sheets['Session Attendance'], { header: 1, defval: '' });
    const headerIdx = rows.findIndex((r) => r[0] === 'Member ID');
    expect(rows[headerIdx]).toEqual(['Member ID', 'Name', 'Specialization', 'Attendance Status', 'Notes']);
    const body = rows.slice(headerIdx + 1);
    expect(body.length).toBe(db.attendance.filter((a) => a.session_id === session.id).length);
    expect(body.every((r) => ['Present', 'Absent', 'Late', 'Excused', 'Not recorded'].includes(r[3]))).toBe(true);
  });
  it('records report contains one row per record', () => {
    const recs = db.attendance.filter((a) => a.status === 'absent');
    const wb = buildRecordsReport(X, { ...data, records: recs }, 'status: Absent');
    const rows = X.utils.sheet_to_json<string[]>(wb.Sheets.Records, { header: 1, defval: '' });
    expect(rows.length - 5).toBe(recs.length);
  });
});

describe('tasks workbook', async () => {
  const X = await loadXLSX();
  const base = { organization: 'Test Team', tasks: db.tasks, specializations: db.specializations, sessions: db.sessions, members: db.members };
  const roundTrip = (wb: ReturnType<typeof buildTasksReport>) =>
    X.read(X.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });

  it('exports all weeks sorted by week, with summary, materials, subtasks and per-week sheets', () => {
    const parsed = roundTrip(buildTasksReport(X, { ...base, week: 'all' }));
    const weeks = [...new Set(db.tasks.map((t) => t.week_number))].sort((a, b) => a - b);
    expect(parsed.SheetNames).toEqual(['All Tasks', 'Summary', 'Materials', 'Subtasks', ...weeks.map((w) => `Week ${w}`)]);
    const rows = X.utils.sheet_to_json<(string | number)[]>(parsed.Sheets['All Tasks'], { header: 1, defval: '' });
    expect(rows[3].slice(0, 3)).toEqual(['#', 'Week', 'Session']);
    expect(rows[3].at(-1)).toBe('Drive Links');
    const body = rows.slice(4);
    expect(body.length).toBe(db.tasks.length);
    const weekCol = body.map((r) => Number(r[1]));
    expect(weekCol).toEqual([...weekCol].sort((a, b) => a - b));
  });

  it('filters a single week and keeps Drive links clickable', () => {
    const withLinks = db.tasks.find((t) => t.materials?.length)!;
    const parsed = roundTrip(buildTasksReport(X, { ...base, week: withLinks.week_number }));
    expect(parsed.SheetNames[0]).toBe(`Week ${withLinks.week_number}`);
    const rows = X.utils.sheet_to_json<(string | number)[]>(parsed.Sheets[parsed.SheetNames[0]], { header: 1, defval: '' });
    expect(rows.slice(4).every((r) => Number(r[1]) === withLinks.week_number)).toBe(true);

    const mats = parsed.Sheets.Materials;
    const matRows = X.utils.sheet_to_json<string[]>(mats, { header: 1, defval: '' }).slice(2);
    expect(matRows.length).toBe(
      db.tasks.filter((t) => t.week_number === withLinks.week_number).reduce((a, t) => a + (t.materials?.length ?? 0), 0),
    );
    expect(mats.G3.l?.Target).toBe(matRows[0][6]);
  });

  it('names files by week', () => {
    expect(tasksFileName(3, '2026-10-22')).toBe('Tasks_Week_3_2026-10-22.xlsx');
    expect(tasksFileName('all', '2026-10-22')).toBe('Tasks_All_Weeks_2026-10-22.xlsx');
  });
});
