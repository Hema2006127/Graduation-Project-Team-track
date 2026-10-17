import { useMemo, useState, type FormEvent } from 'react';
import {
  Calendar, CalendarCheck2, Check, CheckCircle2, CheckSquare, Clock, Cpu, Database, FileText,
  Layers, Layout, MapPin, Palette, Pencil, Plus, Server, Shield, Smartphone,
  Sparkles, Trash2, User, X
} from 'lucide-react';

import clsx from 'clsx';
import type { Session, Specialization, TaskPriority, TeamMember, TrackTask, TrackTaskInput } from '@/types';
import { api } from '@/services';
import { trackTaskSchema, validate, type FieldErrors } from '@/lib/validation';
import { qk, useApiMutation, useMembers, useSessions, useSpecializations, useTasks } from '@/hooks/queries';
import { Avatar, Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatCard } from '@/components/ui/Display';
import { Button, IconButton } from '@/components/ui/Button';
import { SearchInput, SelectField, TextAreaField, TextField } from '@/components/ui/Form';
import { Modal, useConfirm } from '@/components/ui/Modal';
import { formatDate } from '@/lib/dates';

/** Helper to get track icon */
function getTrackIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes('ai') || n.includes('machine') || n.includes('learning')) return Cpu;
  if (n.includes('backend') || n.includes('api')) return Server;
  if (n.includes('frontend') || n.includes('web')) return Layout;
  if (n.includes('flutter') || n.includes('mobile') || n.includes('android') || n.includes('ios')) return Smartphone;
  if (n.includes('ui') || n.includes('ux') || n.includes('design')) return Palette;
  if (n.includes('data') || n.includes('database')) return Database;
  if (n.includes('security') || n.includes('cyber')) return Shield;
  if (n.includes('doc')) return FileText;
  if (n.includes('test') || n.includes('qa')) return CheckCircle2;
  return Layers;
}

const PRIORITY_META: Record<TaskPriority, { label: string; tone: 'red' | 'amber' | 'slate' }> = {
  high: { label: 'High Priority', tone: 'red' },
  medium: { label: 'Medium Priority', tone: 'amber' },
  low: { label: 'Low Priority', tone: 'slate' },
};

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  task: TrackTask | null;
  defaultSpecializationId?: string;
  defaultSessionId?: string;
  specializations: Specialization[];
  sessions: Session[];
  members: TeamMember[];
}

function TaskModal({
  open,
  onClose,
  task,
  defaultSpecializationId,
  defaultSessionId,
  specializations,
  sessions,
  members,
}: TaskModalProps) {
  const [form, setForm] = useState<TrackTaskInput>({
    title: '',
    description: '',
    specialization_id: '',
    session_id: '',
    session_title: '',
    week_number: 1,
    assigned_member_id: '',
    priority: 'medium',
    due_date: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  // Reset or initialize on open
  useMemo(() => {
    if (open) {
      if (task) {
        setForm({
          title: task.title,
          description: task.description ?? '',
          specialization_id: task.specialization_id,
          session_id: task.session_id ?? '',
          session_title: task.session_title ?? '',
          week_number: task.week_number,
          assigned_member_id: task.assigned_member_id ?? '',
          priority: task.priority,
          due_date: task.due_date ?? '',
        });
      } else {
        const initialSessionId = defaultSessionId || (sessions[0]?.id ?? '');
        const matchedSession = sessions.find((s) => s.id === initialSessionId);
        setForm({
          title: '',
          description: '',
          specialization_id: defaultSpecializationId || (specializations[0]?.id ?? ''),
          session_id: initialSessionId,
          session_title: matchedSession?.title ?? '',
          week_number: 1,
          assigned_member_id: '',
          priority: 'medium',
          due_date: matchedSession?.session_date ?? '',
        });
      }
      setErrors({});
    }
  }, [open, task, defaultSpecializationId, defaultSessionId, specializations, sessions]);

  const saveMutation = useApiMutation(
    (input: TrackTaskInput) =>
      task ? api.updateTask(task.id, input) : api.createTask(input),
    {
      invalidate: [qk.tasks],
      success: (t) => (task ? `Task updated: ${t.title}` : `Task created: ${t.title}`),
      errorTitle: 'Could not save task',
    },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = validate(trackTaskSchema, {
      ...form,
      session_id: form.session_id || null,
      session_title: form.session_title || null,
      assigned_member_id: form.assigned_member_id || null,
      due_date: form.due_date || null,
      description: form.description || null,
    });
    if (v.errors) {
      setErrors(v.errors);
      return;
    }

    const assigned = members.find((m) => m.id === v.data.assigned_member_id);
    const sessionObj = sessions.find((s) => s.id === v.data.session_id);

    saveMutation.mutate(
      {
        ...v.data,
        session_title: sessionObj?.title ?? v.data.session_title ?? null,
        assigned_member_name: assigned?.full_name ?? null,
      },
      {
        onSuccess: onClose,
      },
    );
  }

  // Filter members by selected track
  const trackMembers = useMemo(() => {
    if (!form.specialization_id) return members;
    return members.filter((m) => m.specialization_id === form.specialization_id);
  }, [members, form.specialization_id]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={task ? 'Edit Task · تعديل المهمة' : 'Add Session Task · إضافة مهمة للسيشن'}
      description="Choose the session, track, deliverables, and assign team members."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="task-form" loading={saveMutation.isPending}>
            {task ? 'Save Changes' : 'Create Task'}
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} noValidate className="space-y-4">
        {/* Session selector */}
        <SelectField
          label="Session / السيشن"
          required
          value={form.session_id ?? ''}
          onChange={(e) => {
            const sid = e.target.value;
            const sess = sessions.find((s) => s.id === sid);
            setForm({
              ...form,
              session_id: sid,
              session_title: sess?.title ?? '',
              due_date: form.due_date || sess?.session_date || '',
            });
          }}
          error={errors.session_id}
          hint="Select the meeting or checkpoint this task belongs to"
        >
          <option value="">Select session...</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} · {formatDate(s.session_date)} ({s.team_group})
            </option>
          ))}
        </SelectField>

        {/* Task Title */}
        <TextField
          label="Task Title / اسم المهمة"
          required
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          error={errors.title}
          placeholder="e.g. Build authentication endpoints & JWT verification"
          data-autofocus
        />

        {/* Track / Specialization */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="Track / التراك"
            required
            value={form.specialization_id}
            onChange={(e) =>
              setForm({
                ...form,
                specialization_id: e.target.value,
                assigned_member_id: '',
              })
            }
            error={errors.specialization_id}
          >
            <option value="">Select track...</option>
            {specializations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Assignee / المسؤول"
            value={form.assigned_member_id ?? ''}
            onChange={(e) => setForm({ ...form, assigned_member_id: e.target.value })}
            error={errors.assigned_member_id}
            hint={
              trackMembers.length > 0
                ? `${trackMembers.length} member(s) in this track`
                : 'No specific members in this track'
            }
          >
            <option value="">Unassigned (Whole track / غير محدد)</option>
            {trackMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name} ({m.member_code})
              </option>
            ))}
            {members
              .filter((m) => m.specialization_id !== form.specialization_id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} ({m.member_code}) · other track
                </option>
              ))}
          </SelectField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="Priority / الأولوية"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
            error={errors.priority}
          >
            <option value="high">High (عالية)</option>
            <option value="medium">Medium (متوسطة)</option>
            <option value="low">Low (منخفضة)</option>
          </SelectField>

          <TextField
            label="Due Date / تاريخ التسليم"
            type="date"
            value={form.due_date ?? ''}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            error={errors.due_date}
          />
        </div>

        <TextAreaField
          label="Description & Deliverables / تفاصيل المهمة ومخرجاتها"
          rows={3}
          value={form.description ?? ''}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          error={errors.description}
          placeholder="Detailed task goals, requirements, PR links, or Figma screens..."
        />
      </form>
    </Modal>
  );
}

export function TasksPage() {
  const confirm = useConfirm();
  const specializationsQuery = useSpecializations();
  const membersQuery = useMembers();
  const sessionsQuery = useSessions();
  const tasksQuery = useTasks();

  const [selectedTrackId, setSelectedTrackId] = useState<string>('all');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [viewMode, setViewMode] = useState<'by_session' | 'by_track' | 'flat'>('by_session');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TrackTask | null>(null);
  const [activeSessionForModal, setActiveSessionForModal] = useState<string | undefined>(undefined);

  const specializations = specializationsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];
  const allTasks = tasksQuery.data ?? [];

  // Toggle completion mutation ("يعلم عليه عملو ولا لا")
  const toggleMutation = useApiMutation(
    (args: { id: string; completed: boolean }) => api.toggleTaskCompleted(args.id, args.completed),
    {
      invalidate: [qk.tasks],
      success: (t) => (t.is_completed ? `Completed: "${t.title}" ✓` : `Marked pending: "${t.title}"`),
      errorTitle: 'Could not update task status',
    },
  );

  // Delete task mutation
  const deleteMutation = useApiMutation((id: string) => api.deleteTask(id), {
    invalidate: [qk.tasks],
    success: 'Task deleted successfully',
    errorTitle: 'Could not delete task',
  });

  async function handleDelete(task: TrackTask) {
    const ok = await confirm({
      title: 'Delete Task',
      message: `Are you sure you want to delete "${task.title}"? This cannot be undone.`,
      confirmLabel: 'Delete Task',
      tone: 'danger',
    });
    if (ok) {
      deleteMutation.mutate(task.id);
    }
  }

  // Lookup maps
  const specMap = useMemo(() => new Map(specializations.map((s) => [s.id, s])), [specializations]);
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const sessionMap = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (selectedTrackId !== 'all' && t.specialization_id !== selectedTrackId) return false;
      if (selectedSessionId !== 'all' && t.session_id !== selectedSessionId) return false;
      if (statusFilter === 'pending' && t.is_completed) return false;
      if (statusFilter === 'completed' && !t.is_completed) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const specName = specMap.get(t.specialization_id)?.name.toLowerCase() ?? '';
        const memberName = (t.assigned_member_name || memberMap.get(t.assigned_member_id || '')?.full_name || '').toLowerCase();
        const sessionTitle = (t.session_title || sessionMap.get(t.session_id || '')?.title || '').toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchDesc = (t.description ?? '').toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !specName.includes(q) && !memberName.includes(q) && !sessionTitle.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [allTasks, selectedTrackId, selectedSessionId, statusFilter, search, specMap, memberMap, sessionMap]);

  // Overall and filtered stats
  const stats = useMemo(() => {
    const relevantTasks = allTasks.filter((t) => {
      if (selectedTrackId !== 'all' && t.specialization_id !== selectedTrackId) return false;
      if (selectedSessionId !== 'all' && t.session_id !== selectedSessionId) return false;
      return true;
    });
    const total = relevantTasks.length;
    const completed = relevantTasks.filter((t) => t.is_completed).length;
    const pending = total - completed;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pending, rate };
  }, [allTasks, selectedTrackId, selectedSessionId]);

  // Count per track for track pills
  const countPerTrack = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>();
    allTasks.forEach((t) => {
      const cur = map.get(t.specialization_id) ?? { total: 0, completed: 0 };
      cur.total += 1;
      if (t.is_completed) cur.completed += 1;
      map.set(t.specialization_id, cur);
    });
    return map;
  }, [allTasks]);

  // Count per session
  const countPerSession = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>();
    allTasks.forEach((t) => {
      if (!t.session_id) return;
      const cur = map.get(t.session_id) ?? { total: 0, completed: 0 };
      cur.total += 1;
      if (t.is_completed) cur.completed += 1;
      map.set(t.session_id, cur);
    });
    return map;
  }, [allTasks]);

  // Tasks grouped by Session
  const tasksGroupedBySession = useMemo(() => {
    const map = new Map<string, TrackTask[]>();
    filteredTasks.forEach((t) => {
      const sid = t.session_id || 'unassigned_session';
      const list = map.get(sid) ?? [];
      list.push(t);
      map.set(sid, list);
    });
    return Array.from(map.entries()).sort(([idA], [idB]) => {
      if (idA === 'unassigned_session') return 1;
      if (idB === 'unassigned_session') return -1;
      const sA = sessionMap.get(idA);
      const sB = sessionMap.get(idB);
      if (!sA || !sB) return 0;
      return new Date(sB.session_date).getTime() - new Date(sA.session_date).getTime();
    });
  }, [filteredTasks, sessionMap]);

  // Tasks grouped by Track
  const tasksGroupedByTrack = useMemo(() => {
    const map = new Map<string, TrackTask[]>();
    filteredTasks.forEach((t) => {
      const list = map.get(t.specialization_id) ?? [];
      list.push(t);
      map.set(t.specialization_id, list);
    });
    return Array.from(map.entries()).sort(([idA], [idB]) => {
      const sA = specMap.get(idA)?.name ?? '';
      const sB = specMap.get(idB)?.name ?? '';
      return sA.localeCompare(sB);
    });
  }, [filteredTasks, specMap]);

  const activeTrackObj = specializations.find((s) => s.id === selectedTrackId);
  const activeSessionObj = sessions.find((s) => s.id === selectedSessionId);

  const isLoading = tasksQuery.isLoading || specializationsQuery.isLoading || sessionsQuery.isLoading;

  if (tasksQuery.error || specializationsQuery.error || sessionsQuery.error) {
    return (
      <ErrorState
        error={tasksQuery.error || specializationsQuery.error || sessionsQuery.error}
        onRetry={() => {
          tasksQuery.refetch();
          specializationsQuery.refetch();
          sessionsQuery.refetch();
        }}
      />
    );
  }

  // Render a single task item row
  const renderTaskRow = (task: TrackTask, showSessionBadge = false) => {
    const spec = specMap.get(task.specialization_id);
    const TrackIcon = spec ? getTrackIcon(spec.name) : Layers;
    const member = task.assigned_member_id ? memberMap.get(task.assigned_member_id) : null;
    const assigneeName = task.assigned_member_name || member?.full_name || null;
    const priority = PRIORITY_META[task.priority] ?? PRIORITY_META.medium;
    const sessionObj = task.session_id ? sessionMap.get(task.session_id) : null;
    const sessionTitle = task.session_title || sessionObj?.title;

    return (
      <div
        key={task.id}
        className={clsx(
          'group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-xl border p-4 transition-all duration-200',
          task.is_completed
            ? 'border-emerald-200 bg-emerald-50/30 text-slate-600'
            : 'border-slate-200 bg-white shadow-xs hover:border-slate-300 hover:shadow-sm',
        )}
      >
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          {/* Checkbox: toggle completion status */}
          <button
            type="button"
            onClick={() =>
              toggleMutation.mutate({
                id: task.id,
                completed: !task.is_completed,
              })
            }
            title={task.is_completed ? 'Mark as incomplete' : 'Mark as done (تعليم كمنجز)'}
            aria-label={task.is_completed ? 'Mark as incomplete' : 'Mark as done'}
            className={clsx(
              'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg border-2 transition-all duration-150',
              task.is_completed
                ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs scale-105'
                : 'border-slate-300 bg-white hover:border-primary text-transparent hover:text-slate-300',
            )}
          >
            <Check className="size-4 stroke-[3]" />
          </button>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className={clsx(
                  'text-sm font-semibold transition-all',
                  task.is_completed ? 'line-through text-slate-500 font-medium' : 'text-ink',
                )}
              >
                {task.title}
              </h3>

              {task.is_completed ? (
                <Badge tone="green" dot>
                  Done · عملو
                </Badge>
              ) : (
                <Badge tone="amber" dot>
                  Pending · قيد التنفيذ
                </Badge>
              )}
            </div>

            {task.description && (
              <p
                className={clsx(
                  'text-xs leading-relaxed whitespace-pre-line',
                  task.is_completed ? 'text-slate-400' : 'text-slate-600',
                )}
              >
                {task.description}
              </p>
            )}

            {/* Badges: Session, Track, Priority, Assignee, Due Date */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              {/* Session Name Badge (when relevant) */}
              {showSessionBadge && sessionTitle && (
                <span
                  className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 font-medium text-purple-700 ring-1 ring-purple-600/20 ring-inset cursor-pointer hover:bg-purple-100 transition-colors"
                  onClick={() => setSelectedSessionId(task.session_id || 'all')}
                  title="Filter by this session"
                >
                  <CalendarCheck2 className="size-3" />
                  {sessionTitle}
                </span>
              )}

              {/* Track Badge */}
              <span
                className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset cursor-pointer hover:bg-blue-100 transition-colors"
                onClick={() => setSelectedTrackId(task.specialization_id)}
                title="Filter by this track"
              >
                <TrackIcon className="size-3" />
                {spec?.name ?? 'Track'}
              </span>

              {/* Priority Badge */}
              <Badge tone={priority.tone}>{priority.label}</Badge>

              {/* Assignee */}
              {assigneeName ? (
                <span className="inline-flex items-center gap-1.5 text-slate-600 font-medium bg-slate-100/80 px-2 py-0.5 rounded-md">
                  <Avatar name={assigneeName} size="sm" />
                  <span>{assigneeName}</span>
                </span>
              ) : (
                <span className="text-slate-400 italic flex items-center gap-1">
                  <User className="size-3" /> Whole team
                </span>
              )}

              {/* Due Date */}
              {task.due_date && (
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <Calendar className="size-3" />
                  <span>{task.due_date}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
          <IconButton
            label="Edit task"
            onClick={() => {
              setEditingTask(task);
              setModalOpen(true);
            }}
          >
            <Pencil className="size-4" />
          </IconButton>
          <IconButton
            label="Delete task"
            onClick={() => handleDelete(task)}
            className="hover:text-danger hover:bg-red-50"
          >
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly Session Tasks & To-Do"
        description="كل سيشن باسمها ليها تاسكاتها — حدد التراك، أضف مهام السيشن، وعلم على المنجز منها."
        actions={
          <Button
            icon={<Plus className="size-4" />}
            onClick={() => {
              setEditingTask(null);
              setActiveSessionForModal(selectedSessionId !== 'all' ? selectedSessionId : undefined);
              setModalOpen(true);
            }}
          >
            Add Session Task
          </Button>
        }
      />

      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Total Tasks"
          value={isLoading ? '…' : stats.total}
          icon={<CheckSquare className="size-5" />}
          tone="indigo"
          hint={activeTrackObj ? `in ${activeTrackObj.name}` : activeSessionObj ? `in ${activeSessionObj.title}` : 'across all sessions'}
        />
        <StatCard
          label="Completed Tasks"
          value={isLoading ? '…' : stats.completed}
          icon={<CheckCircle2 className="size-5" />}
          tone="green"
          hint="عملوها ✓"
        />
        <StatCard
          label="Pending Tasks"
          value={isLoading ? '…' : stats.pending}
          icon={<Clock className="size-5" />}
          tone="amber"
          hint="قيد التنفيذ"
        />
        <Card className="p-4 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Completion Rate</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-ink">{isLoading ? '…' : `${stats.rate}%`}</span>
              <span className="text-xs text-slate-500">
                ({stats.completed}/{stats.total})
              </span>
            </div>
          </div>
          <div className="mt-3 w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-primary h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${stats.rate}%` }}
            />
          </div>
        </Card>
      </div>

      {/* TRACK SELECTOR PILLS */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <span className="text-sm font-bold text-ink">Choose Track · اختر التراك</span>
            </div>
            {selectedTrackId !== 'all' && (
              <button
                onClick={() => setSelectedTrackId('all')}
                className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
              >
                Show All Tracks
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => setSelectedTrackId('all')}
              className={clsx(
                'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all shadow-sm',
                selectedTrackId === 'all'
                  ? 'bg-primary text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/80',
              )}
            >
              <Layers className="size-4" />
              <span>All Tracks</span>
              <span
                className={clsx(
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                  selectedTrackId === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700',
                )}
              >
                {allTasks.length}
              </span>
            </button>

            {specializations.map((spec) => {
              const Icon = getTrackIcon(spec.name);
              const isSelected = selectedTrackId === spec.id;
              const count = countPerTrack.get(spec.id)?.total ?? 0;

              return (
                <button
                  key={spec.id}
                  onClick={() => setSelectedTrackId(spec.id)}
                  className={clsx(
                    'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all shadow-sm',
                    isSelected
                      ? 'bg-primary text-white shadow-md shadow-blue-500/20'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80',
                  )}
                >
                  <Icon className="size-4" />
                  <span>{spec.name}</span>
                  <span
                    className={clsx(
                      'rounded-full px-2 py-0.5 text-xs font-semibold',
                      isSelected ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* FILTER & SESSION TOOLBAR */}
      <Card className="p-4">
        <div className="flex flex-col gap-4">
          {/* Session Selector & View Mode Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Filter by Session Dropdown */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <CalendarCheck2 className="size-4 text-purple-600 shrink-0" />
              <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">Filter Session:</span>
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="input py-1.5 text-xs min-w-44 max-w-xs"
              >
                <option value="all">All Sessions (كل السيشنات)</option>
                {sessions.map((s) => {
                  const c = countPerSession.get(s.id);
                  return (
                    <option key={s.id} value={s.id}>
                      {s.title} · {formatDate(s.session_date)} ({c ? `${c.completed}/${c.total} done` : '0 tasks'})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* View Mode Switcher */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setViewMode('by_session')}
                className={clsx(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5',
                  viewMode === 'by_session' ? 'bg-white text-ink shadow-xs' : 'text-slate-600 hover:text-ink',
                )}
              >
                <CalendarCheck2 className="size-3.5" />
                <span>By Session (حسب السيشن)</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('by_track')}
                className={clsx(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5',
                  viewMode === 'by_track' ? 'bg-white text-ink shadow-xs' : 'text-slate-600 hover:text-ink',
                )}
              >
                <Layers className="size-3.5" />
                <span>By Track (حسب التراك)</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('flat')}
                className={clsx(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5',
                  viewMode === 'flat' ? 'bg-white text-ink shadow-xs' : 'text-slate-600 hover:text-ink',
                )}
              >
                <CheckSquare className="size-3.5" />
                <span>All Tasks List</span>
              </button>
            </div>
          </div>

          {/* Status filter + Search */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={clsx(
                    'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                    statusFilter === 'all' ? 'bg-white text-ink shadow-xs' : 'text-slate-600 hover:text-ink',
                  )}
                >
                  All ({filteredTasks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('pending')}
                  className={clsx(
                    'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                    statusFilter === 'pending' ? 'bg-white text-ink shadow-xs' : 'text-slate-600 hover:text-ink',
                  )}
                >
                  Pending ({stats.pending})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('completed')}
                  className={clsx(
                    'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                    statusFilter === 'completed' ? 'bg-white text-ink shadow-xs' : 'text-slate-600 hover:text-ink',
                  )}
                >
                  Done ({stats.completed})
                </button>
              </div>

              {(search || selectedSessionId !== 'all' || selectedTrackId !== 'all' || statusFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearch('');
                    setSelectedSessionId('all');
                    setSelectedTrackId('all');
                    setStatusFilter('all');
                  }}
                  className="text-xs text-slate-500 hover:text-danger flex items-center gap-1 px-2 py-1"
                >
                  <X className="size-3" /> Clear filters
                </button>
              )}
            </div>

            <div className="w-full sm:w-72">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search tasks, sessions, members…"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* TASKS VIEW ACCORDING TO VIEW MODE */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="size-6 text-slate-400" />}
          title="No tasks found"
          description={
            search
              ? 'No tasks match your search criteria. Try a different query or clear filters.'
              : selectedSessionId !== 'all'
                ? `No tasks recorded for "${activeSessionObj?.title ?? 'this session'}". Add one now!`
                : selectedTrackId !== 'all'
                  ? `No tasks recorded yet for ${activeTrackObj?.name ?? 'this track'}. Add the first task!`
                  : 'No tasks found. Click "Add Session Task" to create one.'
          }
          action={
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditingTask(null);
                setActiveSessionForModal(selectedSessionId !== 'all' ? selectedSessionId : undefined);
                setModalOpen(true);
              }}
            >
              Add Session Task
            </Button>
          }
        />
      ) : viewMode === 'by_session' ? (
        /* MODE 1: BY SESSION (كل سشين باسمها وتحتها تاسكاتها) */
        <div className="space-y-6">
          {tasksGroupedBySession.map(([sessionId, sessionTasks]) => {
            const session = sessionMap.get(sessionId);
            const sessionTitle = session?.title ?? (sessionId === 'unassigned_session' ? 'General Tasks / مهام عامة' : 'Session Tasks');
            const completedCount = sessionTasks.filter((t) => t.is_completed).length;
            const percent = Math.round((completedCount / sessionTasks.length) * 100);

            return (
              <Card key={sessionId} className="overflow-hidden border-slate-200 shadow-xs">
                {/* Session Header Card Banner */}
                <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-slate-50/60 p-4 sm:px-5 sm:py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-xs">
                          <CalendarCheck2 className="size-4" />
                        </span>
                        <h2 className="text-base font-bold text-ink truncate">
                          {sessionTitle}
                        </h2>
                      </div>

                      {session && (
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pl-10.5">
                          <span className="flex items-center gap-1 font-medium text-slate-600">
                            <Calendar className="size-3.5" />
                            {formatDate(session.session_date)}
                          </span>
                          <span>•</span>
                          <span>{session.team_group}</span>
                          {session.location && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1 truncate max-w-56">
                                <MapPin className="size-3.5" />
                                {session.location}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-semibold text-slate-700">
                          {completedCount} of {sessionTasks.length} tasks completed
                        </p>
                        <div className="mt-1 w-28 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-emerald-600 h-1.5 rounded-full" style={{ width: `${percent}%` }} />
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Plus className="size-3.5" />}
                        onClick={() => {
                          setEditingTask(null);
                          setActiveSessionForModal(session?.id);
                          setModalOpen(true);
                        }}
                      >
                        Add Task
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Session Tasks List */}
                <div className="p-4 sm:p-5 space-y-3">
                  {sessionTasks.map((task) => renderTaskRow(task, false))}
                </div>
              </Card>
            );
          })}
        </div>
      ) : viewMode === 'by_track' ? (
        /* MODE 2: BY TRACK (حسب التراك) */
        <div className="space-y-6">
          {tasksGroupedByTrack.map(([trackId, trackTasks]) => {
            const spec = specMap.get(trackId);
            const TrackIcon = spec ? getTrackIcon(spec.name) : Layers;
            const completedCount = trackTasks.filter((t) => t.is_completed).length;
            const percent = Math.round((completedCount / trackTasks.length) * 100);

            return (
              <div key={trackId} className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-primary">
                      <TrackIcon className="size-4.5" />
                    </span>
                    <div>
                      <h2 className="text-base font-bold text-ink">{spec?.name ?? 'Track Tasks'}</h2>
                      <p className="text-xs text-slate-500">
                        {completedCount} of {trackTasks.length} done ({percent}%)
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setEditingTask(null);
                      setSelectedTrackId(trackId);
                      setModalOpen(true);
                    }}
                    className="text-xs text-primary hover:text-primary-dark font-medium flex items-center gap-1"
                  >
                    <Plus className="size-3.5" /> Add to {spec?.name}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {trackTasks.map((task) => renderTaskRow(task, true))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* MODE 3: FLAT ALL TASKS */
        <div className="space-y-3">
          {filteredTasks.map((task) => renderTaskRow(task, true))}
        </div>
      )}

      {/* Add / Edit Task Modal */}
      <TaskModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingTask(null);
          setActiveSessionForModal(undefined);
        }}
        task={editingTask}
        defaultSpecializationId={selectedTrackId !== 'all' ? selectedTrackId : undefined}
        defaultSessionId={activeSessionForModal ?? (selectedSessionId !== 'all' ? selectedSessionId : undefined)}
        specializations={specializations}
        sessions={sessions}
        members={members}
      />
    </div>
  );
}
