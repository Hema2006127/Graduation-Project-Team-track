import { useMemo, useState, type FormEvent } from 'react';
import {
  Calendar, Check, CheckCircle2, CheckSquare, Clock, Cpu, Database, FileText,
  Layers, Layout, Palette, Pencil, Plus, Server, Shield, Smartphone,
  Sparkles, Trash2, User, X
} from 'lucide-react';

import clsx from 'clsx';
import type { Specialization, TaskPriority, TeamMember, TrackTask, TrackTaskInput } from '@/types';
import { api } from '@/services';
import { trackTaskSchema, validate, type FieldErrors } from '@/lib/validation';
import { qk, useApiMutation, useMembers, useSpecializations, useTasks } from '@/hooks/queries';
import { Avatar, Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatCard } from '@/components/ui/Display';
import { Button, IconButton } from '@/components/ui/Button';
import { SearchInput, SelectField, TextAreaField, TextField } from '@/components/ui/Form';
import { Modal, useConfirm } from '@/components/ui/Modal';

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
  defaultWeekNumber?: number;
  specializations: Specialization[];
  members: TeamMember[];
}

function TaskModal({
  open,
  onClose,
  task,
  defaultSpecializationId,
  defaultWeekNumber,
  specializations,
  members,
}: TaskModalProps) {
  const [form, setForm] = useState<TrackTaskInput>({
    title: '',
    description: '',
    specialization_id: '',
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
          week_number: task.week_number,
          assigned_member_id: task.assigned_member_id ?? '',
          priority: task.priority,
          due_date: task.due_date ?? '',
        });
      } else {
        setForm({
          title: '',
          description: '',
          specialization_id: defaultSpecializationId || (specializations[0]?.id ?? ''),
          week_number: defaultWeekNumber || 1,
          assigned_member_id: '',
          priority: 'medium',
          due_date: '',
        });
      }
      setErrors({});
    }
  }, [open, task, defaultSpecializationId, defaultWeekNumber, specializations]);

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
      week_number: Number(form.week_number) || 1,
      assigned_member_id: form.assigned_member_id || null,
      due_date: form.due_date || null,
      description: form.description || null,
    });
    if (v.errors) {
      setErrors(v.errors);
      return;
    }

    const assigned = members.find((m) => m.id === v.data.assigned_member_id);

    saveMutation.mutate(
      {
        ...v.data,
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
      title={task ? 'Edit Task · تعديل المهمة' : 'Add Weekly Task · إضافة مهمة أسبوعية'}
      description="Add a task for your track, assign it, and track completion."
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
        <TextField
          label="Task Title / عنوان المهمة"
          required
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          error={errors.title}
          placeholder="e.g. Build authentication middleware & JWT verification"
          data-autofocus
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="Track / التراك"
            required
            value={form.specialization_id}
            onChange={(e) =>
              setForm({
                ...form,
                specialization_id: e.target.value,
                // reset assigned member if not in new track
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
            label="Week / الأسبوع"
            required
            value={form.week_number}
            onChange={(e) => setForm({ ...form, week_number: Number(e.target.value) })}
            error={errors.week_number}
          >
            {Array.from({ length: 16 }, (_, i) => i + 1).map((w) => (
              <option key={w} value={w}>
                Week {w} (الأسبوع {w})
              </option>
            ))}
          </SelectField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <option value="">Unassigned (All team / غير محدد)</option>
            {trackMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name} ({m.member_code})
              </option>
            ))}
            {/* Show other members if any */}
            {members
              .filter((m) => m.specialization_id !== form.specialization_id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} ({m.member_code}) · other track
                </option>
              ))}
          </SelectField>

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
        </div>

        <TextField
          label="Due Date / تاريخ التسليم"
          type="date"
          value={form.due_date ?? ''}
          onChange={(e) => setForm({ ...form, due_date: e.target.value })}
          error={errors.due_date}
          hint="Optional target completion date"
        />

        <TextAreaField
          label="Description & Deliverables / تفاصيل المهمة"
          rows={3}
          value={form.description ?? ''}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          error={errors.description}
          placeholder="Describe deliverables, endpoints, Figma links, or notes..."
        />
      </form>
    </Modal>
  );
}

export function TasksPage() {
  const confirm = useConfirm();
  const specializationsQuery = useSpecializations();
  const membersQuery = useMembers();
  const tasksQuery = useTasks();

  const [selectedTrackId, setSelectedTrackId] = useState<string>('all');
  const [selectedWeek, setSelectedWeek] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TrackTask | null>(null);

  const specializations = specializationsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const allTasks = tasksQuery.data ?? [];

  // Toggle completion mutation
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

  // Weeks available in data or standard weeks (1 to 10)
  const availableWeeks = useMemo(() => {
    const set = new Set<number>([1, 2, 3, 4, 5]);
    allTasks.forEach((t) => set.add(t.week_number));
    return Array.from(set).sort((a, b) => a - b);
  }, [allTasks]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (selectedTrackId !== 'all' && t.specialization_id !== selectedTrackId) return false;
      if (selectedWeek !== 'all' && t.week_number !== Number(selectedWeek)) return false;
      if (statusFilter === 'pending' && t.is_completed) return false;
      if (statusFilter === 'completed' && !t.is_completed) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const specName = specMap.get(t.specialization_id)?.name.toLowerCase() ?? '';
        const memberName = (t.assigned_member_name || memberMap.get(t.assigned_member_id || '')?.full_name || '').toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchDesc = (t.description ?? '').toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !specName.includes(q) && !memberName.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [allTasks, selectedTrackId, selectedWeek, statusFilter, search, specMap, memberMap]);

  // Stats calculation for the currently selected track/filter
  const stats = useMemo(() => {
    const relevantTasks = allTasks.filter((t) => {
      if (selectedTrackId !== 'all' && t.specialization_id !== selectedTrackId) return false;
      if (selectedWeek !== 'all' && t.week_number !== Number(selectedWeek)) return false;
      return true;
    });
    const total = relevantTasks.length;
    const completed = relevantTasks.filter((t) => t.is_completed).length;
    const pending = total - completed;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pending, rate };
  }, [allTasks, selectedTrackId, selectedWeek]);

  // Tasks count per track (for pill badges)
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

  // Group filtered tasks by week for structured presentation
  const tasksByWeek = useMemo(() => {
    const map = new Map<number, TrackTask[]>();
    filteredTasks.forEach((t) => {
      const list = map.get(t.week_number) ?? [];
      list.push(t);
      map.set(t.week_number, list);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [filteredTasks]);

  const activeTrackObj = specializations.find((s) => s.id === selectedTrackId);

  if (tasksQuery.error || specializationsQuery.error) {
    return (
      <ErrorState
        error={tasksQuery.error || specializationsQuery.error}
        onRetry={() => {
          tasksQuery.refetch();
          specializationsQuery.refetch();
        }}
      />
    );
  }

  const isLoading = tasksQuery.isLoading || specializationsQuery.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly Tasks & To-Do"
        description="Select your track, assign weekly deliverables, and track completion."
        actions={
          <Button
            icon={<Plus className="size-4" />}
            onClick={() => {
              setEditingTask(null);
              setModalOpen(true);
            }}
          >
            Add Weekly Task
          </Button>
        }
      />

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Total Tasks"
          value={isLoading ? '…' : stats.total}
          icon={<CheckSquare className="size-5" />}
          tone="indigo"
          hint={activeTrackObj ? `in ${activeTrackObj.name}` : 'across all tracks'}
        />
        <StatCard
          label="Completed Tasks"
          value={isLoading ? '…' : stats.completed}
          icon={<CheckCircle2 className="size-5" />}
          tone="green"
          hint="Deliverables completed"
        />
        <StatCard
          label="Pending Tasks"
          value={isLoading ? '…' : stats.pending}
          icon={<Clock className="size-5" />}
          tone="amber"
          hint="In progress / to-do"
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

      {/* TRACK SELECTOR TABS / PILLS */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <span className="text-sm font-bold text-ink">Choose Your Track · اختر التراك</span>
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
              const completedCount = countPerTrack.get(spec.id)?.completed ?? 0;

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
                    title={`${completedCount} completed of ${count}`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* FILTER & WEEK TOOLBAR */}
      <Card className="p-4">
        <div className="flex flex-col gap-4">
          {/* Week selector pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap mr-1 flex items-center gap-1">
              <Calendar className="size-3.5" /> Weeks:
            </span>
            <button
              onClick={() => setSelectedWeek('all')}
              className={clsx(
                'rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                selectedWeek === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              All Weeks
            </button>
            {availableWeeks.map((w) => {
              const isSelected = selectedWeek === String(w);
              const weekCount = allTasks.filter((t) =>
                (selectedTrackId === 'all' || t.specialization_id === selectedTrackId) && t.week_number === w
              ).length;

              return (
                <button
                  key={w}
                  onClick={() => setSelectedWeek(String(w))}
                  className={clsx(
                    'rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5',
                    isSelected ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  <span>Week {w}</span>
                  {weekCount > 0 && (
                    <span
                      className={clsx(
                        'rounded-full px-1.5 py-0.2 text-[10px]',
                        isSelected ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-600',
                      )}
                    >
                      {weekCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Secondary filter & search row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Status filter tabs */}
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
                  Completed ({stats.completed})
                </button>
              </div>

              {(search || selectedWeek !== 'all' || selectedTrackId !== 'all' || statusFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearch('');
                    setSelectedWeek('all');
                    setSelectedTrackId('all');
                    setStatusFilter('all');
                  }}
                  className="text-xs text-slate-500 hover:text-danger flex items-center gap-1 px-2 py-1"
                >
                  <X className="size-3" /> Clear filters
                </button>
              )}
            </div>

            <div className="w-full sm:w-64">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search tasks, deliverables, members…"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* TASK LIST / WEEKS VIEW */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="size-6 text-slate-400" />}
          title="No tasks found"
          description={
            search
              ? 'No tasks match your search criteria. Try a different query or clear filters.'
              : selectedTrackId !== 'all'
                ? `No tasks recorded yet for ${activeTrackObj?.name ?? 'this track'}. Add the first weekly task now!`
                : 'No tasks found. Click "Add Weekly Task" to create one.'
          }
          action={
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditingTask(null);
                setModalOpen(true);
              }}
            >
              Add Weekly Task
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {tasksByWeek.map(([weekNum, tasks]) => {
            const weekCompleted = tasks.filter((t) => t.is_completed).length;
            const weekPercent = Math.round((weekCompleted / tasks.length) * 100);

            return (
              <div key={weekNum} className="space-y-3">
                {/* Week Header */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white shadow-xs">
                      W{weekNum}
                    </span>
                    <h2 className="text-base font-bold text-ink">
                      Week {weekNum} Deliverables · مهام الأسبوع {weekNum}
                    </h2>
                    <span className="text-xs text-slate-500">
                      ({weekCompleted} of {tasks.length} done · {weekPercent}%)
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setEditingTask(null);
                      setModalOpen(true);
                    }}
                    className="text-xs text-primary hover:text-primary-dark font-medium flex items-center gap-1"
                  >
                    <Plus className="size-3.5" /> Add to Week {weekNum}
                  </button>
                </div>

                {/* Tasks Cards Container */}
                <div className="grid grid-cols-1 gap-3">
                  {tasks.map((task) => {
                    const spec = specMap.get(task.specialization_id);
                    const TrackIcon = spec ? getTrackIcon(spec.name) : Layers;
                    const member = task.assigned_member_id ? memberMap.get(task.assigned_member_id) : null;
                    const assigneeName = task.assigned_member_name || member?.full_name || null;
                    const priority = PRIORITY_META[task.priority] ?? PRIORITY_META.medium;

                    return (
                      <div
                        key={task.id}
                        className={clsx(
                          'group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border p-4 transition-all duration-200',
                          task.is_completed
                            ? 'border-emerald-200 bg-emerald-50/30 text-slate-600'
                            : 'border-slate-200 bg-white shadow-xs hover:border-slate-300 hover:shadow-sm',
                        )}
                      >
                        {/* Left Side: Checkbox + Title + Description + Badges */}
                        <div className="flex items-start gap-3.5 min-w-0 flex-1">
                          {/* CHECKBOX: Click to toggle completion status */}
                          <button
                            type="button"
                            onClick={() =>
                              toggleMutation.mutate({
                                id: task.id,
                                completed: !task.is_completed,
                              })
                            }
                            title={task.is_completed ? 'Mark as incomplete' : 'Mark as completed (عملو)'}
                            aria-label={task.is_completed ? 'Mark as incomplete' : 'Mark as completed'}
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
                                  task.is_completed
                                    ? 'line-through text-slate-500 font-medium'
                                    : 'text-ink',
                                )}
                              >
                                {task.title}
                              </h3>

                              {task.is_completed ? (
                                <Badge tone="green" dot>
                                  Done · مكتمل
                                </Badge>
                              ) : (
                                <Badge tone="amber" dot>
                                  In Progress · قيد التنفيذ
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

                            {/* Metadata Pills: Track, Priority, Assignee, Due Date */}
                            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                              {/* Track Badge */}
                              <span
                                className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset cursor-pointer hover:bg-blue-100 transition-colors"
                                onClick={() => setSelectedTrackId(task.specialization_id)}
                                title="Click to filter by this track"
                              >
                                <TrackIcon className="size-3" />
                                {spec?.name ?? 'Track'}
                              </span>

                              {/* Priority Badge */}
                              <Badge tone={priority.tone}>
                                {priority.label}
                              </Badge>

                              {/* Assignee */}
                              {assigneeName ? (
                                <span className="inline-flex items-center gap-1.5 text-slate-600 font-medium bg-slate-100/80 px-2 py-0.5 rounded-md">
                                  <Avatar name={assigneeName} size="sm" />
                                  <span>{assigneeName}</span>
                                </span>
                              ) : (

                                <span className="text-slate-400 italic flex items-center gap-1">
                                  <User className="size-3" /> Unassigned
                                </span>
                              )}

                              {/* Due Date */}
                              {task.due_date && (
                                <span className="inline-flex items-center gap-1 text-slate-500">
                                  <Calendar className="size-3" />
                                  <span>Due: {task.due_date}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right Side: Edit / Delete Actions */}
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
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Task Modal */}
      <TaskModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingTask(null);
        }}
        task={editingTask}
        defaultSpecializationId={selectedTrackId !== 'all' ? selectedTrackId : undefined}
        defaultWeekNumber={selectedWeek !== 'all' ? Number(selectedWeek) : 1}
        specializations={specializations}
        members={members}
      />
    </div>
  );
}
