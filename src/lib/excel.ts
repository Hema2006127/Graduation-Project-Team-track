/**
 * Excel exports (SheetJS via xlsx-js-style for cell styling).
 *  1. Attendance matrix — one column per session (P/A/L/E) + totals + %.
 *  2. Session report    — one session, one row per member.
 *  3. Records report    — the filtered record list from the Reports page.
 * Every workbook has a formatted header, column widths, auto-filters, real
 * Excel dates, percentage formats and a summary section.
 */
import type { WorkBook, WorkSheet } from 'xlsx-js-style';
import type { AttendanceRecord, AttendanceStatus, Profile, Session, Specialization, TeamMember } from '@/types';
import { countStatuses, STATUS_META, sortSessions } from './attendance';
import { formatDate, formatDateTime, formatTimeRange, MONTHS, parseISODate } from './dates';

type XLSXModule = typeof import('xlsx-js-style');
let xlsxPromise: Promise<XLSXModule> | null = null;
/** Lazy-loads SheetJS so it is not part of the initial bundle. */
export function loadXLSX(): Promise<XLSXModule> {
  xlsxPromise ??= import('xlsx-js-style').then((m) => ((m as unknown as { default?: XLSXModule }).default ?? m));
  return xlsxPromise;
}

// ---- styling ---------------------------------------------------------------
const BORDER = { style: 'thin', color: { rgb: 'CBD5E1' } };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const S = {
  title: { font: { bold: true, sz: 16, color: { rgb: '0F172A' } } },
  subtitle: { font: { sz: 10, color: { rgb: '475569' } } },
  section: { font: { bold: true, sz: 12, color: { rgb: '2563EB' } } },
  header: {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '2563EB' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: BORDERS,
  },
  cell: { border: BORDERS, alignment: { vertical: 'center' } },
  center: { border: BORDERS, alignment: { horizontal: 'center', vertical: 'center' } },
  label: { font: { bold: true, color: { rgb: '334155' } } },
  total: { font: { bold: true }, fill: { fgColor: { rgb: 'F1F5F9' } }, border: BORDERS },
};
const STATUS_FILL: Record<AttendanceStatus, string> = {
  present: 'DCFCE7',
  absent: 'FEE2E2',
  late: 'FEF3C7',
  excused: 'DBEAFE',
};
const statusStyle = (s: AttendanceStatus | null) => ({
  ...S.center,
  ...(s ? { fill: { fgColor: { rgb: STATUS_FILL[s] } }, font: { bold: true } } : { font: { color: { rgb: '94A3B8' } } }),
});

type Cell = { v: string | number; t: 's' | 'n'; s?: object; z?: string };
const str = (v: string | null | undefined, s: object = S.cell): Cell => ({ v: v ?? '', t: 's', s });
const num = (v: number, s: object = S.center, z?: string): Cell => ({ v, t: 'n', s, ...(z ? { z } : {}) });
const pct = (rate: number | null, s: object = S.center): Cell =>
  rate === null ? str('—', s) : { v: rate / 100, t: 'n', z: '0.0%', s };
/** Real Excel date (serial number) formatted dd/mm/yyyy. */
const date = (iso: string, s: object = S.center): Cell => {
  const d = parseISODate(iso);
  const serial = (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000;
  return { v: serial, t: 'n', z: 'dd/mm/yyyy', s };
};
const blank = (): Cell => ({ v: '', t: 's' });

function sheet(X: XLSXModule, rows: (Cell | null)[][], opts: { widths: number[]; filter?: [number, number, number, number]; merges?: [number, number, number, number][]; headerRow?: number }): WorkSheet {
  const ws = X.utils.aoa_to_sheet(rows.map((r) => r.map((c) => c ?? blank())));
  ws['!cols'] = opts.widths.map((wch) => ({ wch }));
  if (opts.filter) {
    const [r1, c1, r2, c2] = opts.filter;
    ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } }) };
  }
  if (opts.merges) ws['!merges'] = opts.merges.map(([r1, c1, r2, c2]) => ({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } }));
  if (opts.headerRow !== undefined) {
    const heights: { hpt?: number }[] = [];
    heights[0] = { hpt: 24 };
    heights[opts.headerRow] = { hpt: 36 };
    ws['!rows'] = heights;
  }
  return ws;
}

// ---- shared inputs ----------------------------------------------------------
export interface ReportData {
  organization: string;
  members: TeamMember[];
  sessions: Session[];
  records: AttendanceRecord[];
  specializations: Specialization[];
  profiles: Profile[];
  threshold: number;
  period: { from?: string; to?: string };
  generatedAt?: Date;
}

const specName = (d: ReportData, id: string | null) => d.specializations.find((s) => s.id === id)?.name ?? '—';
const doctorName = (d: ReportData, id: string | null) => d.profiles.find((p) => p.id === id)?.full_name ?? '—';
const periodLabel = (p: ReportData['period']) =>
  p.from || p.to ? `${p.from ? formatDate(p.from) : 'Start'} – ${p.to ? formatDate(p.to) : 'Today'}` : 'All time';

/** Team_Attendance_Report_September_2026.xlsx */
export function reportFileName(prefix: string, period: ReportData['period'], fallbackIso: string) {
  const from = period.from ?? period.to ?? fallbackIso;
  const to = period.to ?? period.from ?? fallbackIso;
  const f = parseISODate(from);
  const t = parseISODate(to);
  const label = (d: Date, short = false) => `${short ? MONTHS[d.getMonth()].slice(0, 3) : MONTHS[d.getMonth()]}_${d.getFullYear()}`;
  const part =
    !period.from && !period.to
      ? `All_Time_${fallbackIso}`
      : f.getFullYear() === t.getFullYear() && f.getMonth() === t.getMonth()
        ? label(f)
        : `${label(f, true)}_to_${label(t, true)}`;
  return `${prefix}_${part}.xlsx`;
}

// ---- 1. Attendance matrix --------------------------------------------------
/** `sessions` must already be the completed, non-cancelled sessions to include. */
export function buildAttendanceMatrix(X: XLSXModule, d: ReportData): WorkBook {
  const sessions = sortSessions(d.sessions);
  const sessionIds = new Set(sessions.map((s) => s.id));
  const key = (sid: string, mid: string) => `${sid}|${mid}`;
  const rec = new Map(d.records.filter((r) => sessionIds.has(r.session_id)).map((r) => [key(r.session_id, r.team_member_id), r]));

  const rowsData = d.members.map((m) => {
    const statuses = sessions.map((s) => rec.get(key(s.id, m.id))?.status ?? null);
    return { m, statuses, stats: countStatuses(statuses) };
  });

  // Attendance sheet
  const fixed = ['Member ID', 'Name', 'Specialization'];
  const header = [
    ...fixed.map((h) => str(h, S.header)),
    ...sessions.map((s, i) => str(`Session ${i + 1}\n${formatDate(s.session_date)}`, S.header)),
    ...['Present', 'Absent', 'Late', 'Excused', 'Attendance %'].map((h) => str(h, S.header)),
  ];
  const lastCol = header.length - 1;
  const HEADER_ROW = 3;
  const rows: (Cell | null)[][] = [
    [str(`${d.organization} — Team Attendance Report`, S.title)],
    [str(`Period: ${periodLabel(d.period)}   •   Sessions: ${sessions.length}   •   Generated: ${formatDateTime((d.generatedAt ?? new Date()).toISOString())}`, S.subtitle)],
    [str('Legend: P = Present, A = Absent, L = Late, E = Excused, – = not recorded / not on roster. Attendance % = (Present + Late) / (Sessions − Excused).', S.subtitle)],
    header,
    ...rowsData.map(({ m, statuses, stats }) => [
      str(m.member_code, S.center),
      str(m.status === 'inactive' ? `${m.full_name} (inactive)` : m.full_name),
      str(specName(d, m.specialization_id)),
      ...statuses.map((st) => str(st ? STATUS_META[st].short : '–', statusStyle(st))),
      num(stats.present),
      num(stats.absent),
      num(stats.late),
      num(stats.excused),
      pct(stats.rate, { ...S.center, font: { bold: true } }),
    ]),
  ];
  const team = countStatuses(rowsData.flatMap((r) => r.statuses));
  const totalRow = rows.length;
  rows.push([
    str('TOTAL', S.total), str('', S.total), str('', S.total),
    ...sessions.map((s) => {
      const c = countStatuses(rowsData.map((r) => r.statuses[sessions.indexOf(s)]));
      return pct(c.rate, S.total);
    }),
    num(team.present, S.total), num(team.absent, S.total), num(team.late, S.total), num(team.excused, S.total),
    pct(team.rate, S.total),
  ]);

  const wsMatrix = sheet(X, rows, {
    widths: [11, 26, 22, ...sessions.map(() => 12), 9, 9, 9, 9, 13],
    filter: [HEADER_ROW, 0, totalRow - 1, lastCol],
    merges: [[0, 0, 0, Math.max(lastCol, 6)], [1, 0, 1, Math.max(lastCol, 6)], [2, 0, 2, Math.max(lastCol, 6)]],
    headerRow: HEADER_ROW,
  });

  // Summary sheet
  const below = rowsData.filter((r) => r.stats.rate !== null && r.stats.rate < d.threshold);
  const rated = rowsData.filter((r) => r.stats.rate !== null);
  const avgMember = rated.length ? rated.reduce((a, r) => a + r.stats.rate!, 0) / rated.length : null;
  const summaryRows: (Cell | null)[][] = [
    [str(`${d.organization} — Attendance Summary`, S.title)],
    [str(`Generated ${formatDateTime((d.generatedAt ?? new Date()).toISOString())}`, S.subtitle)],
    [],
    [str('Report period', S.label), str(periodLabel(d.period))],
    [str('Team members', S.label), num(d.members.length, {})],
    [str('Completed sessions', S.label), num(sessions.length, {})],
    [str('Total present', S.label), num(team.present, {})],
    [str('Total absent', S.label), num(team.absent, {})],
    [str('Total late', S.label), num(team.late, {})],
    [str('Total excused', S.label), num(team.excused, {})],
    [str('Team attendance %', S.label), pct(team.rate, { font: { bold: true } })],
    [str('Average member attendance %', S.label), pct(avgMember, {})],
    [str(`Members below ${d.threshold}%`, S.label), num(below.length, {})],
    [],
    [str('Members below threshold', S.section)],
    [str('Member ID', S.header), str('Name', S.header), str('Specialization', S.header), str('Attendance %', S.header)],
    ...(below.length
      ? below.map((r) => [str(r.m.member_code, S.center), str(r.m.full_name), str(specName(d, r.m.specialization_id)), pct(r.stats.rate)])
      : [[str('None — everyone is above the threshold.', S.cell), str(''), str(''), str('')]]),
    [],
    [str('Cancelled and upcoming sessions are excluded. Excused absences are excluded from the denominator.', S.subtitle)],
  ];
  const wsSummary = sheet(X, summaryRows, { widths: [30, 28, 22, 14], merges: [[0, 0, 0, 3], [1, 0, 1, 3]] });

  // Sessions sheet
  const sessionHeader = ['#', 'Session', 'Date', 'Time', 'Doctor', 'Group', 'Present', 'Absent', 'Late', 'Excused', 'Attendance %'];
  const sessionRows: (Cell | null)[][] = [
    [str('Sessions included in the report', S.title)],
    sessionHeader.map((h) => str(h, S.header)),
    ...sessions.map((s, i) => {
      const c = countStatuses(rowsData.map((r) => r.statuses[i]));
      return [
        str(`Session ${i + 1}`, S.center), str(s.title), date(s.session_date), str(formatTimeRange(s.start_time, s.end_time), S.center),
        str(doctorName(d, s.doctor_id)), str(s.team_group), num(c.present), num(c.absent), num(c.late), num(c.excused), pct(c.rate),
      ];
    }),
  ];
  const wsSessions = sheet(X, sessionRows, {
    widths: [11, 30, 12, 20, 22, 20, 9, 9, 9, 9, 13],
    filter: [1, 0, Math.max(1, sessionRows.length - 1), sessionHeader.length - 1],
    headerRow: 1,
  });

  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, wsMatrix, 'Attendance');
  X.utils.book_append_sheet(wb, wsSummary, 'Summary');
  X.utils.book_append_sheet(wb, wsSessions, 'Sessions');
  return wb;
}

// ---- 2. Single-session report ----------------------------------------------
export function buildSessionReport(X: XLSXModule, d: ReportData, session: Session): WorkBook {
  const recs = d.records.filter((r) => r.session_id === session.id);
  const memberById = new Map(d.members.map((m) => [m.id, m]));
  const list = recs
    .map((r) => ({ r, m: memberById.get(r.team_member_id) }))
    .filter((x): x is { r: AttendanceRecord; m: TeamMember } => !!x.m)
    .sort((a, b) => a.m.member_code.localeCompare(b.m.member_code));
  const c = countStatuses(list.map((x) => x.r.status));
  const pending = list.filter((x) => !x.r.status).length;

  const header = ['Member ID', 'Name', 'Specialization', 'Attendance Status', 'Notes'];
  const HEADER_ROW = 12;
  const rows: (Cell | null)[][] = [
    [str(`Session Attendance — ${session.title}`, S.title)],
    [str(`${d.organization}   •   Generated ${formatDateTime((d.generatedAt ?? new Date()).toISOString())}`, S.subtitle)],
    [],
    [str('Date', S.label), date(session.session_date, { alignment: { horizontal: 'left' } })],
    [str('Time', S.label), str(formatTimeRange(session.start_time, session.end_time), {})],
    [str('Doctor', S.label), str(doctorName(d, session.doctor_id), {})],
    [str('Group / Location', S.label), str(`${session.team_group}${session.location ? ` — ${session.location}` : ''}`, {})],
    [str('Status', S.label), str(session.status === 'cancelled' ? 'Cancelled' : 'Scheduled', {})],
    [str('Summary', S.label), str(`Present ${c.present}  •  Absent ${c.absent}  •  Late ${c.late}  •  Excused ${c.excused}${pending ? `  •  Not recorded ${pending}` : ''}`, {})],
    [str('Attendance %', S.label), pct(c.rate, { font: { bold: true }, alignment: { horizontal: 'left' } })],
    [],
    [],
    header.map((h) => str(h, S.header)),
    ...list.map(({ r, m }) => [
      str(m.member_code, S.center),
      str(m.full_name),
      str(specName(d, m.specialization_id)),
      str(r.status ? STATUS_META[r.status].label : 'Not recorded', statusStyle(r.status)),
      str(r.notes),
    ]),
  ];
  const ws = sheet(X, rows, {
    widths: [16, 28, 22, 18, 36],
    filter: [HEADER_ROW, 0, Math.max(HEADER_ROW, rows.length - 1), header.length - 1],
    merges: [[0, 0, 0, 4], [1, 0, 1, 4]],
    headerRow: HEADER_ROW,
  });
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, 'Session Attendance');
  return wb;
}

export const sessionFileName = (s: Session) =>
  `Session_Attendance_${s.title.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '')}_${s.session_date}.xlsx`;

// ---- 3. Filtered records ---------------------------------------------------
export function buildRecordsReport(X: XLSXModule, d: ReportData, filterDescription: string): WorkBook {
  const sessionById = new Map(d.sessions.map((s) => [s.id, s]));
  const memberById = new Map(d.members.map((m) => [m.id, m]));
  const list = d.records
    .map((r) => ({ r, s: sessionById.get(r.session_id), m: memberById.get(r.team_member_id) }))
    .filter((x): x is { r: AttendanceRecord; s: Session; m: TeamMember } => !!x.s && !!x.m)
    .sort((a, b) => `${b.s.session_date}${b.s.start_time}`.localeCompare(`${a.s.session_date}${a.s.start_time}`) || a.m.member_code.localeCompare(b.m.member_code));
  const c = countStatuses(list.map((x) => x.r.status));
  const header = ['Date', 'Session', 'Member ID', 'Name', 'Specialization', 'Status', 'Notes'];
  const HEADER_ROW = 4;
  const rows: (Cell | null)[][] = [
    [str(`${d.organization} — Attendance Records`, S.title)],
    [str(`Period: ${periodLabel(d.period)}   •   Filters: ${filterDescription || 'none'}   •   Generated ${formatDateTime((d.generatedAt ?? new Date()).toISOString())}`, S.subtitle)],
    [str(`Records: ${list.length}   •   Present ${c.present}   •   Absent ${c.absent}   •   Late ${c.late}   •   Excused ${c.excused}   •   Attendance ${c.rate === null ? '—' : c.rate.toFixed(1) + '%'}`, S.subtitle)],
    [],
    header.map((h) => str(h, S.header)),
    ...list.map(({ r, s, m }) => [
      date(s.session_date), str(s.title), str(m.member_code, S.center), str(m.full_name), str(specName(d, m.specialization_id)),
      str(r.status ? STATUS_META[r.status].label : 'Not recorded', statusStyle(r.status)), str(r.notes),
    ]),
  ];
  const ws = sheet(X, rows, {
    widths: [12, 30, 11, 26, 22, 14, 34],
    filter: [HEADER_ROW, 0, Math.max(HEADER_ROW, rows.length - 1), header.length - 1],
    merges: [[0, 0, 0, 6], [1, 0, 1, 6], [2, 0, 2, 6]],
    headerRow: HEADER_ROW,
  });
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, 'Records');
  return wb;
}

export async function downloadWorkbook(wb: WorkBook, fileName: string) {
  const X = await loadXLSX();
  X.writeFile(wb, fileName, { compression: true });
}
