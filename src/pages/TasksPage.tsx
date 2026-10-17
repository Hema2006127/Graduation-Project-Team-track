import { useMemo, useState, type FormEvent, useEffect } from 'react';
import {
  Calendar, CalendarCheck2, Check, CheckCircle2, CheckSquare, ChevronDown, ChevronUp, Clock, Cpu,
  Database, FileText, Layers, Layout, ListChecks, ListPlus, MapPin, Palette, Pencil, Plus,
  RotateCcw, Server, Shield, Smartphone, Sparkles, Trash2, User, UserCheck
} from 'lucide-react';
import clsx from 'clsx';
import type { Session, Specialization, TaskPriority, TeamMember, TrackTask, TrackTaskInput } from '@/types';
import { api } from '@/services';
import { trackTaskSchema, validate, type FieldErrors } from '@/lib/validation';
import { useAuth } from '@/context/AuthContext';
import { qk, useApiMutation, useMembers, useSessions, useSpecializations, useTasks } from '@/hooks/queries';
import { Avatar, Badge, EmptyState, ErrorState, PageHeader, Skeleton, StatCard } from '@/components/ui/Display';
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

// -----------------------------------------------------------------------------
// Task Modal: Add / Edit Main Task with Multiple Subtasks
// -----------------------------------------------------------------------------
interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  task: TrackTask | null;
  defaultSpecializationId?: string;
  defaultSessionId?: string;
  defaultMemberId?: string;
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
  defaultMemberId,
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
    subtasks: [],
  });
  const [subtasks, setSubtasks] = useState<{ id: string; title: string; is_completed: boolean }[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  // Reset or initialize on open
  useEffect(() => {
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
          subtasks: task.subtasks ?? [],
        });
        setSubtasks(task.subtasks ?? []);
      } else {
        const initialSessionId = defaultSessionId || (sessions[0]?.id ?? '');
        const matchedSession = sessions.find((s) => s.id === initialSessionId);
        const initialSpecId = defaultSpecializationId || (specializations[0]?.id ?? '');
        setForm({
          title: '',
          description: '',
          specialization_id: initialSpecId,
          session_id: initialSessionId,
          session_title: matchedSession?.title ?? '',
          week_number: 1,
          assigned_member_id: defaultMemberId ?? '',
          priority: 'medium',
          due_date: matchedSession?.session_date ?? '',
          subtasks: [],
        });
        setSubtasks([]);
      }
      setNewSubtaskTitle('');
      setShowBulkAdd(false);
      setBulkText('');
      setErrors({});
    }
  }, [open, task, defaultSpecializationId, defaultSessionId, defaultMemberId, specializations, sessions]);

  const saveMutation = useApiMutation(
    (input: TrackTaskInput) =>
      task ? api.updateTask(task.id, input) : api.createTask(input),
    {
      invalidate: [qk.tasks],
      success: (t) => (task ? `Task updated: ${t.title}` : `Task created: ${t.title}`),
      errorTitle: 'Could not save task',
    },
  );

  function handleAddSubtask() {
    const trimmed = newSubtaskTitle.trim();
    if (!trimmed) return;
    setSubtasks((prev) => [
      ...prev,
      { id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: trimmed, is_completed: false },
    ]);
    setNewSubtaskTitle('');
  }

  function handleAddBulkSubtasks() {
    const lines = bulkText
      .split('\n')
      .map((l) => l.trim().replace(/^[-*•]\s*/, ''))
      .filter((l) => l.length > 0);
    if (lines.length === 0) return;
    const newItems = lines.map((line, idx) => ({
      id: `bulk-${Date.now()}-${idx}`,
      title: line,
      is_completed: false,
    }));
    setSubtasks((prev) => [...prev, ...newItems]);
    setBulkText('');
    setShowBulkAdd(false);
  }

  function handleRemoveSubtask(id: string) {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = validate(trackTaskSchema, {
      ...form,
      session_id: form.session_id || null,
      session_title: form.session_title || null,
      assigned_member_id: form.assigned_member_id || null,
      due_date: form.due_date || null,
      description: form.description || null,
      subtasks: subtasks.map((st) => ({
        id: st.id,
        title: st.title.trim(),
        is_completed: Boolean(st.is_completed),
      })),
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
        subtasks,
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

  const selectedSpecObj = specializations.find((s) => s.id === form.specialization_id);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? 'تعديل المهمة وتفاصيلها' : 'إضافة مهمة جديدة للسيشن والتراك'}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-xs text-slate-500">
            {subtasks.length > 0 ? `${subtasks.length} مهام تفصيلية مضافة` : 'يمكنك إضافة مهام تفصيلية فرعية'}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              إلغاء
            </Button>
            <Button loading={saveMutation.isPending} type="submit" form="task-form">
              {task ? 'حفظ التعديلات' : 'إنشاء المهمة'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="task-form" onSubmit={submit} className="space-y-4">
        {selectedSpecObj && (
          <div className="flex items-center gap-2 rounded-xl bg-blue-50/80 px-3.5 py-2.5 text-xs text-blue-900 border border-blue-200/80">
            <Sparkles className="size-4 shrink-0 text-blue-600" />
            <span>
              تم قراءة التراك تلقائياً من تخصصك المسؤول: <strong>{selectedSpecObj.name}</strong>
            </span>
          </div>
        )}

        <TextField
          label="عنوان المهمة الرئيسي (Task Title) *"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          error={errors.title}
          placeholder="مثال: بناء شاشة الـ Dashboard وربط الـ API"
          autoFocus
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Track selection */}
          <SelectField
            label="التراك / التخصص المسؤول *"
            value={form.specialization_id}
            onChange={(e) => setForm({ ...form, specialization_id: e.target.value })}
            error={errors.specialization_id}
          >
            {specializations.map((spec) => (
              <option key={spec.id} value={spec.id}>
                {spec.name}
              </option>
            ))}
          </SelectField>

          {/* Session selection */}
          <SelectField
            label="السيشن التابع لها (Session) *"
            value={form.session_id ?? ''}
            onChange={(e) => {
              const matched = sessions.find((s) => s.id === e.target.value);
              setForm({
                ...form,
                session_id: e.target.value,
                session_title: matched?.title ?? '',
                due_date: form.due_date || (matched?.session_date ?? ''),
              });
            }}
            error={errors.session_id}
          >
            {sessions.map((sess) => (
              <option key={sess.id} value={sess.id}>
                {sess.title} ({sess.session_date})
              </option>
            ))}
          </SelectField>
        </div>

        {/* Subtasks Section: Multiple tasks can be added here */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListChecks className="size-4 text-primary" />
              <span className="text-xs font-bold text-ink">
                المهام التفصيلية الإضافية (Subtasks / كذا تاسك)
              </span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                {subtasks.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowBulkAdd(!showBulkAdd)}
              className="text-xs text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              <ListPlus className="size-3.5" />
              {showBulkAdd ? 'إلغاء الإضافة السريعة' : 'إضافة عدة مهام دفعة واحدة'}
            </button>
          </div>

          {showBulkAdd ? (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-white p-3">
              <p className="text-[11px] text-slate-500">
                اكتب أو الصق عدة مهام (كل مهمة في سطر منفصل):
              </p>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={3}
                placeholder="تطوير واجهة تسجيل الدخول&#10;كتابة الاختبارات وتوثيق الـ API&#10;تصميم زر التأكيد والأنيميشن"
                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:border-primary focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="secondary" type="button" onClick={() => setShowBulkAdd(false)}>
                  إلغاء
                </Button>
                <Button size="sm" type="button" onClick={handleAddBulkSubtasks}>
                  إضافة المهام كلها
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubtask();
                  }
                }}
                placeholder="أضف مهمة تفصيلية واضغط Enter (مثال: ربط الـ API، تصميم الشاشة...)"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
              />
              <Button size="sm" type="button" onClick={handleAddSubtask} icon={<Plus className="size-3.5" />}>
                إضافة
              </Button>
            </div>
          )}

          {subtasks.length > 0 && (
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {subtasks.map((st, i) => (
                <div
                  key={st.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 border border-slate-200 text-xs shadow-2xs"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="flex size-4 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                      {i + 1}
                    </span>
                    <span className="truncate font-medium text-slate-700">{st.title}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveSubtask(st.id)}
                    className="text-slate-400 hover:text-red-500 p-1 transition-colors cursor-pointer"
                    title="حذف هذه المهمة الفرعية"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Assigned Member */}
          <SelectField
            label="العضو المسؤول (Assignee)"
            value={form.assigned_member_id ?? ''}
            onChange={(e) => setForm({ ...form, assigned_member_id: e.target.value })}
            error={errors.assigned_member_id}
          >
            <option value="">الفريق بأكمله (Whole Team)</option>
            {trackMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name} ({m.member_code})
              </option>
            ))}
          </SelectField>

          {/* Week number */}
          <TextField
            label="رقم الأسبوع (Week) *"
            type="number"
            min={1}
            max={52}
            value={form.week_number}
            onChange={(e) => setForm({ ...form, week_number: Number(e.target.value) || 1 })}
            error={errors.week_number}
          />

          {/* Priority */}
          <SelectField
            label="الأولوية (Priority)"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
          >
            <option value="high">مرتفعة (High Priority)</option>
            <option value="medium">متوسطة (Medium Priority)</option>
            <option value="low">منخفضة (Low Priority)</option>
          </SelectField>
        </div>

        <TextField
          label="تاريخ التسليم المتوقع (Due Date)"
          type="date"
          value={form.due_date ?? ''}
          onChange={(e) => setForm({ ...form, due_date: e.target.value })}
          error={errors.due_date}
        />

        <TextAreaField
          label="ملاحظات وتفاصيل إضافية"
          rows={2}
          value={form.description ?? ''}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          error={errors.description}
          placeholder="روابط Figma، مخرجات مطلوبة، مراجع برمجية..."
        />
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Task Details Modal: View full task details, and manage/toggle subtasks
// -----------------------------------------------------------------------------
interface TaskDetailsModalProps {
  task: TrackTask | null;
  onClose: () => void;
  onEdit: (task: TrackTask) => void;
  onDelete: (task: TrackTask) => void;
  onToggleMain: (task: TrackTask) => void;
  specialization?: Specialization;
  session?: Session;
  assignee?: TeamMember;
}

function TaskDetailsModal({
  task,
  onClose,
  onEdit,
  onDelete,
  onToggleMain,
  specialization,
  session,
  assignee,
}: TaskDetailsModalProps) {
  const [newSubtask, setNewSubtask] = useState('');

  const addSubtaskMutation = useApiMutation(
    (title: string) => (task ? api.addSubtask(task.id, title) : Promise.reject('No task')),
    {
      invalidate: [qk.tasks],
      success: 'تمت إضافة المهمة الفرعية بنجاح',
      errorTitle: 'تعذر إضافة المهمة',
    },
  );

  const toggleSubtaskMutation = useApiMutation(
    ({ subtaskId, completed }: { subtaskId: string; completed: boolean }) =>
      task ? api.toggleSubtask(task.id, subtaskId, completed) : Promise.reject('No task'),
    {
      invalidate: [qk.tasks],
      errorTitle: 'تعذر تحديث المهمة',
    },
  );

  const deleteSubtaskMutation = useApiMutation(
    (subtaskId: string) => (task ? api.deleteSubtask(task.id, subtaskId) : Promise.reject('No task')),
    {
      invalidate: [qk.tasks],
      success: 'تم حذف المهمة الفرعية',
      errorTitle: 'تعذر الحذف',
    },
  );

  if (!task) return null;

  const subtasks = task.subtasks ?? [];
  const completedCount = subtasks.filter((s) => s.is_completed).length;
  const progressPercent = subtasks.length > 0 ? Math.round((completedCount / subtasks.length) * 100) : task.is_completed ? 100 : 0;
  const TrackIcon = specialization ? getTrackIcon(specialization.name) : Layers;
  const priority = PRIORITY_META[task.priority] ?? PRIORITY_META.medium;

  function handleAdd() {
    const trimmed = newSubtask.trim();
    if (!trimmed) return;
    addSubtaskMutation.mutate(trimmed, {
      onSuccess: () => setNewSubtask(''),
    });
  }

  return (
    <Modal
      open={Boolean(task)}
      onClose={onClose}
      title="تفاصيل المهمة والمهام التابعة لها"
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={task.is_completed ? 'secondary' : 'primary'}
              icon={<Check className="size-4" />}
              onClick={() => onToggleMain(task)}
            >
              {task.is_completed ? 'إلغاء اكتمال المهمة الرئيسية' : 'تحديد المهمة الرئيسية كمكتملة'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Pencil className="size-3.5" />}
              onClick={() => {
                onClose();
                onEdit(task);
              }}
            >
              تعديل
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="text-danger hover:bg-red-50 hover:border-red-200"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => {
                onClose();
                onDelete(task);
              }}
            >
              حذف
            </Button>
            <Button size="sm" variant="secondary" onClick={onClose}>
              إغلاق
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 text-sm">
        {/* Main Task Header */}
        <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-blue-50/40 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                  <TrackIcon className="size-3.5" />
                  {specialization?.name ?? 'Track'}
                </span>
                <Badge tone={priority.tone}>{priority.label}</Badge>
                <span className="rounded-md bg-slate-200/70 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  الأسبوع {task.week_number}
                </span>
              </div>
              <h2 className={clsx('text-base font-bold text-ink mt-1.5', task.is_completed && 'line-through text-slate-500')}>
                {task.title}
              </h2>
            </div>
            <div className="shrink-0">
              {task.is_completed ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                  <CheckCircle2 className="size-4" /> مكتملة · Done
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                  <Clock className="size-4" /> قيد التنفيذ · Pending
                </span>
              )}
            </div>
          </div>

          {task.description && (
            <p className="text-xs text-slate-600 leading-relaxed bg-white/70 rounded-lg p-2.5 border border-slate-200/60 whitespace-pre-line">
              {task.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3 text-xs text-slate-600">
            {session && (
              <div className="flex items-center gap-1.5">
                <CalendarCheck2 className="size-4 text-purple-600 shrink-0" />
                <span className="truncate font-medium">{session.title}</span>
              </div>
            )}
            {task.due_date && (
              <div className="flex items-center gap-1.5">
                <Calendar className="size-4 text-slate-400 shrink-0" />
                <span>تسليم: {task.due_date}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Avatar name={assignee?.full_name ?? task.assigned_member_name ?? 'Whole Team'} size="sm" />
              <span className="truncate font-medium">
                {assignee?.full_name ?? task.assigned_member_name ?? 'الفريق بأكمله'}
              </span>
            </div>
          </div>
        </div>

        {/* Subtasks Section: View, Toggle, and Add Multiple Subtasks */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <ListChecks className="size-4 text-primary" />
                المهام الفرعية والتفصيلية للتاسك ({subtasks.length} مهام)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                يمكنك إضافة وإنجاز كذا تاسك تفصيلي داخل هذه المهمة مع المتابعة الدقيقة.
              </p>
            </div>
            {subtasks.length > 0 && (
              <span className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                {completedCount} / {subtasks.length} منجز ({progressPercent}%)
              </span>
            )}
          </div>

          {/* Progress Bar */}
          {subtasks.length > 0 && (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {progressPercent === 100 && (
                <p className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  <Sparkles className="size-3.5" /> جميع المهام التفصيلية تم إنجازها بنجاح!
                </p>
              )}
            </div>
          )}

          {/* Inline Add Subtask Input */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="اكتب مهمة تفصيلية جديدة واضغط Enter..."
              className="flex-1 rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2 text-xs text-ink focus:border-primary focus:bg-white focus:outline-none"
            />
            <Button
              size="sm"
              loading={addSubtaskMutation.isPending}
              onClick={handleAdd}
              icon={<Plus className="size-3.5" />}
            >
              إضافة
            </Button>
          </div>

          {/* Subtasks List */}
          {subtasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
              لا توجد مهام تفصيلية مضافة بعد. يمكنك كتابة مهمة بالأعلى والضغط على إضافة.
            </div>
          ) : (
            <div className="space-y-2">
              {subtasks.map((st) => (
                <div
                  key={st.id}
                  className={clsx(
                    'group flex items-center justify-between gap-3 rounded-xl border p-2.5 transition-all',
                    st.is_completed
                      ? 'border-emerald-200/60 bg-emerald-50/30'
                      : 'border-slate-200 bg-white hover:border-blue-200',
                  )}
                >
                  <label className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={st.is_completed}
                      onChange={(e) =>
                        toggleSubtaskMutation.mutate({ subtaskId: st.id, completed: e.target.checked })
                      }
                      className="size-4 rounded-md border-slate-300 text-primary accent-primary cursor-pointer"
                    />
                    <div className="min-w-0 flex-1">
                      <span
                        className={clsx(
                          'text-xs font-medium block',
                          st.is_completed ? 'line-through text-slate-400' : 'text-slate-800',
                        )}
                      >
                        {st.title}
                      </span>
                      {st.completed_at && (
                        <span className="text-[10px] text-emerald-600 block mt-0.5">
                          تم الإنجاز: {formatDate(st.completed_at)}
                        </span>
                      )}
                    </div>
                  </label>

                  <button
                    type="button"
                    onClick={() => deleteSubtaskMutation.mutate(st.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 p-1 rounded-md transition-all cursor-pointer"
                    title="حذف هذه المهمة الفرعية"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Main TasksPage Component
// -----------------------------------------------------------------------------
export function TasksPage() {
  const confirm = useConfirm();
  const { profile } = useAuth();
  const specializationsQuery = useSpecializations();
  const membersQuery = useMembers();
  const sessionsQuery = useSessions();
  const tasksQuery = useTasks();

  const specializations = specializationsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];
  const allTasks = tasksQuery.data ?? [];

  // 1. Detect registered user and read their responsible track
  const [activeMemberId, setActiveMemberId] = useState<string>(() => {
    return localStorage.getItem('ta.registered_member_id') ?? '';
  });

  // Resolve current registered member
  const registeredMember = useMemo(() => {
    if (profile?.team_member_id) {
      const m = members.find((x) => x.id === profile.team_member_id);
      if (m) return m;
    }
    if (profile?.email) {
      const m = members.find((x) => x.email.toLowerCase() === profile.email.toLowerCase());
      if (m) return m;
    }
    if (activeMemberId) {
      const m = members.find((x) => x.id === activeMemberId);
      if (m) return m;
    }
    return members[0] ?? null;
  }, [profile, members, activeMemberId]);

  // Read the specialization responsible from the registered member
  const registeredSpecialization = useMemo(() => {
    if (!registeredMember?.specialization_id) return null;
    return specializations.find((s) => s.id === registeredMember.specialization_id) ?? null;
  }, [registeredMember, specializations]);

  // Track filter: defaults to the registered member's track
  const [selectedTrackId, setSelectedTrackId] = useState<string>('all');
  const [initializedTrack, setInitializedTrack] = useState(false);

  useEffect(() => {
    if (!initializedTrack && registeredSpecialization?.id) {
      setSelectedTrackId(registeredSpecialization.id);
      setInitializedTrack(true);
    }
  }, [initializedTrack, registeredSpecialization]);

  const [selectedSessionId, setSelectedSessionId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [viewMode, setViewMode] = useState<'by_session' | 'by_track' | 'flat'>('by_session');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TrackTask | null>(null);
  const [activeSessionForModal, setActiveSessionForModal] = useState<string | undefined>(undefined);
  const [viewingDetailsTask, setViewingDetailsTask] = useState<TrackTask | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());

  // Toggle card subtasks accordion
  function toggleAccordion(taskId: string) {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  // Toggle completion mutation ("يعلم عليه عملو ولا لا")
  const toggleMutation = useApiMutation(
    (args: { id: string; completed: boolean }) => api.toggleTaskCompleted(args.id, args.completed),
    {
      invalidate: [qk.tasks],
      success: (t) => (t.is_completed ? `Completed: "${t.title}" ✓` : `Marked pending: "${t.title}"`),
      errorTitle: 'Could not update task status',
    },
  );

  const toggleSubtaskMutation = useApiMutation(
    ({ taskId, subtaskId, completed }: { taskId: string; subtaskId: string; completed: boolean }) =>
      api.toggleSubtask(taskId, subtaskId, completed),
    {
      invalidate: [qk.tasks],
      errorTitle: 'تعذر تحديث المهمة الفرعية',
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
      message: `هل أنت متأكد من حذف المهمة "${task.title}" وجميع مهامها الفرعية؟`,
      confirmLabel: 'حذف المهمة',
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

  // Keep viewingDetailsTask updated when allTasks refetches
  const currentDetailsTask = useMemo(() => {
    if (!viewingDetailsTask) return null;
    return allTasks.find((t) => t.id === viewingDetailsTask.id) ?? viewingDetailsTask;
  }, [viewingDetailsTask, allTasks]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    let list = allTasks;

    if (selectedTrackId !== 'all') {
      list = list.filter((t) => t.specialization_id === selectedTrackId);
    }
    if (selectedSessionId !== 'all') {
      list = list.filter((t) => t.session_id === selectedSessionId);
    }
    if (statusFilter === 'pending') {
      list = list.filter((t) => !t.is_completed);
    } else if (statusFilter === 'completed') {
      list = list.filter((t) => t.is_completed);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => {
        const titleMatch = t.title.toLowerCase().includes(q);
        const descMatch = (t.description ?? '').toLowerCase().includes(q);
        const memberMatch = (t.assigned_member_name ?? '').toLowerCase().includes(q);
        const sessionMatch = (t.session_title ?? '').toLowerCase().includes(q);
        const subtasksMatch = (t.subtasks ?? []).some((st) => st.title.toLowerCase().includes(q));
        return titleMatch || descMatch || memberMatch || sessionMatch || subtasksMatch;
      });
    }

    return list;
  }, [allTasks, selectedTrackId, selectedSessionId, statusFilter, search]);

  // Overall stats
  const stats = useMemo(() => {
    const total = filteredTasks.length;
    const completed = filteredTasks.filter((t) => t.is_completed).length;
    const pending = total - completed;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const totalSubtasks = filteredTasks.reduce((acc, t) => acc + (t.subtasks?.length ?? 0), 0);
    const completedSubtasks = filteredTasks.reduce(
      (acc, t) => acc + (t.subtasks?.filter((s) => s.is_completed).length ?? 0),
      0,
    );
    return { total, completed, pending, percent, totalSubtasks, completedSubtasks };
  }, [filteredTasks]);

  // Count per track
  const countPerTrack = useMemo(() => {
    const counts = new Map<string, { total: number; completed: number }>();
    allTasks.forEach((t) => {
      const cur = counts.get(t.specialization_id) ?? { total: 0, completed: 0 };
      cur.total += 1;
      if (t.is_completed) cur.completed += 1;
      counts.set(t.specialization_id, cur);
    });
    return counts;
  }, [allTasks]);

  // Tasks grouped by Session
  const tasksGroupedBySession = useMemo(() => {
    const grouped = new Map<string, TrackTask[]>();
    sessions.forEach((s) => grouped.set(s.id, []));

    filteredTasks.forEach((t) => {
      const key = t.session_id || 'unassigned';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(t);
    });

    return Array.from(grouped.entries())
      .map(([sessId, tasks]) => {
        const sess = sessionMap.get(sessId);
        return {
          session: sess ?? null,
          sessionId: sessId,
          title: sess?.title ?? 'مهام عامة بدون سيشن محددة',
          date: sess?.session_date ?? '',
          location: sess?.location ?? null,
          tasks,
          total: tasks.length,
          completed: tasks.filter((t) => t.is_completed).length,
        };
      })
      .filter((g) => {
        if (selectedSessionId !== 'all') return g.sessionId === selectedSessionId;
        return g.total > 0 || (selectedTrackId === 'all' && g.session !== null);
      })
      .sort((a, b) => {
        if (a.date && b.date) return new Date(b.date).getTime() - new Date(a.date).getTime();
        return 0;
      });
  }, [filteredTasks, sessions, sessionMap, selectedSessionId, selectedTrackId]);

  // Tasks grouped by Track
  const tasksGroupedByTrack = useMemo(() => {
    const grouped = new Map<string, TrackTask[]>();
    specializations.forEach((s) => grouped.set(s.id, []));

    filteredTasks.forEach((t) => {
      if (!grouped.has(t.specialization_id)) grouped.set(t.specialization_id, []);
      grouped.get(t.specialization_id)!.push(t);
    });

    return Array.from(grouped.entries())
      .map(([specId, tasks]) => {
        const spec = specMap.get(specId);
        return {
          specialization: spec,
          specId,
          name: spec?.name ?? 'تراك غير معروف',
          tasks,
          total: tasks.length,
          completed: tasks.filter((t) => t.is_completed).length,
        };
      })
      .filter((g) => g.total > 0 || (selectedTrackId !== 'all' && g.specId === selectedTrackId));
  }, [filteredTasks, specializations, specMap, selectedTrackId]);

  const isLoading = tasksQuery.isLoading || specializationsQuery.isLoading || sessionsQuery.isLoading;
  const isError = tasksQuery.isError || specializationsQuery.isError || sessionsQuery.isError;

  if (isError) {
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

  // ---------------------------------------------------------------------------
  // Render Task Card Item
  // ---------------------------------------------------------------------------
  const renderTaskItem = (task: TrackTask, showSessionBadge: boolean = false) => {
    const spec = specMap.get(task.specialization_id);
    const TrackIcon = spec ? getTrackIcon(spec.name) : Layers;
    const priority = PRIORITY_META[task.priority] ?? PRIORITY_META.medium;
    const assignee = task.assigned_member_id ? memberMap.get(task.assigned_member_id) : null;
    const assigneeName = assignee?.full_name ?? task.assigned_member_name;
    const sessionTitle = task.session_title || (task.session_id ? sessionMap.get(task.session_id)?.title : null);
    const subtasks = task.subtasks ?? [];
    const completedSubCount = subtasks.filter((s) => s.is_completed).length;
    const isExpanded = expandedTaskIds.has(task.id);

    return (
      <div
        key={task.id}
        className={clsx(
          'group relative flex flex-col rounded-xl border p-4 transition-all duration-200',
          task.is_completed
            ? 'bg-slate-50/70 border-slate-200/80 shadow-2xs'
            : 'bg-white border-slate-200 shadow-xs hover:border-blue-300 hover:shadow-md',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {/* Main Task Checkbox */}
            <button
              type="button"
              onClick={() => toggleMutation.mutate({ id: task.id, completed: !task.is_completed })}
              className={clsx(
                'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg border transition-all duration-150 cursor-pointer',
                task.is_completed
                  ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                  : 'border-slate-300 bg-white text-transparent hover:border-emerald-500 hover:bg-emerald-50/50',
              )}
              title={task.is_completed ? 'Mark task as pending' : 'Mark task as completed (عملو ولا لا)'}
            >
              <Check className="size-4 stroke-[3]" />
            </button>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  onClick={() => setViewingDetailsTask(task)}
                  className={clsx(
                    'text-sm font-semibold transition-all cursor-pointer hover:text-primary',
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

                {/* Subtask count badge */}
                {subtasks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleAccordion(task.id)}
                    className={clsx(
                      'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold transition-colors cursor-pointer',
                      completedSubCount === subtasks.length
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100',
                    )}
                  >
                    <ListChecks className="size-3" />
                    <span>
                      {completedSubCount}/{subtasks.length} مهام فرعية
                    </span>
                    {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                  </button>
                )}
              </div>

              {task.description && (
                <p
                  className={clsx(
                    'text-xs leading-relaxed whitespace-pre-line line-clamp-2',
                    task.is_completed ? 'text-slate-400' : 'text-slate-600',
                  )}
                >
                  {task.description}
                </p>
              )}

              {/* Badges: Session, Track, Priority, Assignee, Due Date */}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
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

                <span
                  className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset cursor-pointer hover:bg-blue-100 transition-colors"
                  onClick={() => setSelectedTrackId(task.specialization_id)}
                  title="Filter by this track"
                >
                  <TrackIcon className="size-3" />
                  {spec?.name ?? 'Track'}
                </span>

                <Badge tone={priority.tone}>{priority.label}</Badge>

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
            <Button
              size="sm"
              variant="secondary"
              className="text-xs h-7 px-2"
              onClick={() => setViewingDetailsTask(task)}
            >
              تفاصيل المهمة
            </Button>
            <IconButton
              label="تعديل المهمة"
              onClick={() => {
                setEditingTask(task);
                setModalOpen(true);
              }}
            >
              <Pencil className="size-3.5" />
            </IconButton>
            <IconButton
              label="حذف المهمة"
              onClick={() => handleDelete(task)}
              className="hover:text-danger hover:bg-red-50"
            >
              <Trash2 className="size-3.5" />
            </IconButton>
          </div>
        </div>

        {/* Expandable Subtasks Checklist right on the Card */}
        {isExpanded && subtasks.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-2.5 space-y-1.5 bg-slate-50/50 rounded-lg p-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1">
              <span className="flex items-center gap-1">
                <ListChecks className="size-3.5 text-primary" /> قائمة المهام التفصيلية
              </span>
              <button
                type="button"
                onClick={() => setViewingDetailsTask(task)}
                className="text-primary hover:underline text-[11px] cursor-pointer"
              >
                + إضافة أو إدارة كذا تاسك
              </button>
            </div>
            {subtasks.map((st) => (
              <label
                key={st.id}
                className="flex items-center gap-2 text-xs py-1 px-1.5 rounded hover:bg-white cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={st.is_completed}
                  onChange={(e) =>
                    toggleSubtaskMutation.mutate({
                      taskId: task.id,
                      subtaskId: st.id,
                      completed: e.target.checked,
                    })
                  }
                  className="size-3.5 rounded border-slate-300 text-primary accent-primary"
                />
                <span className={clsx(st.is_completed ? 'line-through text-slate-400' : 'text-slate-700 font-medium')}>
                  {st.title}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly Session Tasks & To-Do"
        description="كل سيشن باسمها ليها تاسكاتها — حدد التراك، أضف مهام السيشن والمهام التفصيلية، وعلم على المنجز منها."
        actions={
          <Button
            icon={<Plus className="size-4" />}
            onClick={() => {
              setEditingTask(null);
              setActiveSessionForModal(selectedSessionId !== 'all' ? selectedSessionId : undefined);
              setModalOpen(true);
            }}
          >
            إضافة مهمة جديدة
          </Button>
        }
      />

      {/* 2. Registered Member & Responsible Track Banner */}
      {registeredMember && registeredSpecialization && (
        <div className="rounded-2xl border border-blue-200/90 bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 p-4 text-white shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full ring-2 ring-white/50 shrink-0">
                <Avatar
                  name={registeredMember.full_name}
                  src={registeredMember.avatar_url}
                  size="lg"
                />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-base tracking-tight">{registeredMember.full_name}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold backdrop-blur-xs">
                    <UserCheck className="size-3" /> {registeredMember.member_code}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 text-slate-900 px-2.5 py-0.5 text-xs font-bold shadow-xs">
                    تخصصك: {registeredSpecialization.name}
                  </span>
                </div>
                <p className="mt-1 text-xs text-blue-100 flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-yellow-300" />
                  <span>
                    تم قراءة التراك المسؤول عنه من تخصصك تلقائياً ({registeredSpecialization.name}) وضبط العرض والتاسكات عليه.
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedTrackId(registeredSpecialization.id)}
                className={clsx(
                  'rounded-xl px-3 py-1.5 text-xs font-bold transition-all shadow-xs cursor-pointer',
                  selectedTrackId === registeredSpecialization.id
                    ? 'bg-white text-primary'
                    : 'bg-white/20 text-white hover:bg-white/30',
                )}
              >
                ⭐ عرض تاسكات تخصصي فقط
              </button>

              {/* Member Switcher Dropdown */}
              <select
                value={registeredMember.id}
                onChange={(e) => {
                  const mId = e.target.value;
                  setActiveMemberId(mId);
                  localStorage.setItem('ta.registered_member_id', mId);
                  const newMember = members.find((x) => x.id === mId);
                  if (newMember?.specialization_id) {
                    setSelectedTrackId(newMember.specialization_id);
                  }
                }}
                className="rounded-xl bg-white/20 text-white px-2.5 py-1.5 text-xs font-medium backdrop-blur-xs border border-white/30 focus:outline-none cursor-pointer"
                title="تبديل العضو المتسجل لمعاينة تخصص آخر"
              >
                {members.map((m) => {
                  const specName = specMap.get(m.specialization_id ?? '')?.name ?? 'بدون تخصص';
                  return (
                    <option key={m.id} value={m.id} className="text-slate-800">
                      {m.full_name} · {specName}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="إجمالي المهام"
          value={isLoading ? '…' : stats.total}
          icon={<CheckSquare className="size-5" />}
          tone="indigo"
          hint={
            selectedTrackId !== 'all'
              ? `في تراك ${specMap.get(selectedTrackId)?.name}`
              : selectedSessionId !== 'all'
              ? `في سيشن ${sessionMap.get(selectedSessionId)?.title}`
              : 'عبر كل السيشنات'
          }
        />
        <StatCard
          label="المهام المنجزة"
          value={isLoading ? '…' : stats.completed}
          icon={<CheckCircle2 className="size-5" />}
          tone="green"
          hint="عملوها ✓"
        />
        <StatCard
          label="المهام المتبقية"
          value={isLoading ? '…' : stats.pending}
          icon={<Clock className="size-5" />}
          tone="amber"
          hint="قيد التنفيذ"
        />
        <StatCard
          label="نسبة الإنجاز ومهامها"
          value={isLoading ? '…' : `${stats.percent}%`}
          icon={<Sparkles className="size-5" />}
          tone="blue"
          hint={`${stats.completedSubtasks} من ${stats.totalSubtasks} مهمة فرعية`}
        />
      </div>

      {/* Track Selector Bar (Pills) */}
      <div className="card p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="size-3.5 text-primary" /> اختر التراك / التخصص (Select Track)
          </span>
          {selectedTrackId !== 'all' && (
            <button
              onClick={() => setSelectedTrackId('all')}
              className="text-xs text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              <RotateCcw className="size-3" /> عرض كل التراكات
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedTrackId('all')}
            className={clsx(
              'flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer',
              selectedTrackId === 'all'
                ? 'bg-primary text-white shadow-sm shadow-blue-500/25 ring-2 ring-primary ring-offset-1'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80',
            )}
          >
            <Layers className="size-3.5" />
            <span>كل التراكات</span>
            <span
              className={clsx(
                'rounded-full px-1.5 py-0.2 text-[10px] font-bold',
                selectedTrackId === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700',
              )}
            >
              {allTasks.length}
            </span>
          </button>

          {specializations.map((spec) => {
            const TrackIcon = getTrackIcon(spec.name);
            const count = countPerTrack.get(spec.id) ?? { total: 0, completed: 0 };
            const isSelected = selectedTrackId === spec.id;
            const isRegisteredUserTrack = registeredSpecialization?.id === spec.id;

            return (
              <button
                key={spec.id}
                type="button"
                onClick={() => setSelectedTrackId(spec.id)}
                className={clsx(
                  'flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer',
                  isSelected
                    ? 'bg-primary text-white shadow-sm shadow-blue-500/25 ring-2 ring-primary ring-offset-1'
                    : isRegisteredUserTrack
                    ? 'bg-blue-50 text-blue-900 border border-blue-300 font-bold hover:bg-blue-100'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80',
                )}
              >
                <TrackIcon className="size-3.5" />
                <span>
                  {isRegisteredUserTrack ? `⭐ ${spec.name} (تخصصي)` : spec.name}
                </span>
                <span
                  className={clsx(
                    'rounded-full px-1.5 py-0.2 text-[10px] font-bold',
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700',
                  )}
                >
                  {count.total}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Control Filters Bar */}
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            placeholder="بحث في المهام والمهام الفرعية أو الأعضاء..."
            value={search}
            onChange={setSearch}
          />

          <SelectField
            label="السيشن (Session)"
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
          >
            <option value="all">كل السيشنات ({sessions.length})</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.session_date})
              </option>
            ))}
          </SelectField>

          <SelectField
            label="حالة الإنجاز (Status)"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'pending' | 'completed')}
          >
            <option value="all">كل الحالات ({allTasks.length})</option>
            <option value="pending">قيد التنفيذ / Pending</option>
            <option value="completed">منجز / Done</option>
          </SelectField>

          {/* View mode switcher */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">طريقة العرض (View)</label>
            <div className="flex rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setViewMode('by_session')}
                className={clsx(
                  'flex-1 rounded-md py-1 text-xs font-semibold transition-all cursor-pointer text-center',
                  viewMode === 'by_session' ? 'bg-white text-primary shadow-2xs font-bold' : 'text-slate-600',
                )}
              >
                حسب السيشن
              </button>
              <button
                type="button"
                onClick={() => setViewMode('by_track')}
                className={clsx(
                  'flex-1 rounded-md py-1 text-xs font-semibold transition-all cursor-pointer text-center',
                  viewMode === 'by_track' ? 'bg-white text-primary shadow-2xs font-bold' : 'text-slate-600',
                )}
              >
                حسب التراك
              </button>
              <button
                type="button"
                onClick={() => setViewMode('flat')}
                className={clsx(
                  'flex-1 rounded-md py-1 text-xs font-semibold transition-all cursor-pointer text-center',
                  viewMode === 'flat' ? 'bg-white text-primary shadow-2xs font-bold' : 'text-slate-600',
                )}
              >
                قائمة شاملة
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          title="لا توجد مهام مطابقة"
          description={
            search || selectedTrackId !== 'all' || selectedSessionId !== 'all' || statusFilter !== 'all'
              ? 'جرّب تغيير الفلاتر أو البحث لعرض مهام أخرى.'
              : 'لم تتم إضافة أي مهام أسبوعية بعد.'
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
              إضافة مهمة جديدة الآن
            </Button>
          }
        />
      ) : viewMode === 'by_session' ? (
        /* ------------------------------------------------------------------- */
        /* View 1: Tasks Grouped By Session (كل سيشن باسمها ليها تاسكاتها)      */
        /* ------------------------------------------------------------------- */
        <div className="space-y-6">
          {tasksGroupedBySession.map((group) => {
            const percent = group.total > 0 ? Math.round((group.completed / group.total) * 100) : 0;

            return (
              <div
                key={group.sessionId}
                className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs transition-all hover:shadow-md"
              >
                {/* Session Card Header */}
                <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-purple-50/20 to-blue-50/20 p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
                          <CalendarCheck2 className="size-4" />
                        </span>
                        <h2 className="text-base font-bold text-ink tracking-tight">{group.title}</h2>
                        {group.total > 0 && (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            {group.total} مهام
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-0.5">
                        {group.date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="size-3.5 text-slate-400" />
                            <span>تاريخ السيشن: {formatDate(group.date)}</span>
                          </span>
                        )}
                        {group.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3.5 text-slate-400" />
                            <span>{group.location}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar & Add Task Button */}
                    <div className="flex items-center gap-4">
                      {group.total > 0 && (
                        <div className="flex items-center gap-2 text-xs">
                          <div className="w-24 sm:w-32 bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-blue-500 to-emerald-500 h-full rounded-full transition-all duration-300"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="font-bold text-slate-700 whitespace-nowrap">
                            {group.completed}/{group.total} ({percent}%)
                          </span>
                        </div>
                      )}

                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Plus className="size-3.5" />}
                        onClick={() => {
                          setEditingTask(null);
                          setActiveSessionForModal(group.session?.id);
                          setModalOpen(true);
                        }}
                      >
                        + إضافة تاسك للسيشن
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Session Tasks List */}
                <div className="p-4 sm:p-5">
                  {group.tasks.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                      لا توجد مهام لهذه السيشن بعد بالتراك المختار.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {group.tasks.map((task) => renderTaskItem(task, false))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === 'by_track' ? (
        /* ------------------------------------------------------------------- */
        /* View 2: Tasks Grouped By Track                                      */
        /* ------------------------------------------------------------------- */
        <div className="space-y-6">
          {tasksGroupedByTrack.map((group) => {
            const TrackIcon = getTrackIcon(group.name);
            const percent = group.total > 0 ? Math.round((group.completed / group.total) * 100) : 0;

            return (
              <div
                key={group.specId}
                className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs"
              >
                <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50/30 p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                        <TrackIcon className="size-5" />
                      </span>
                      <div>
                        <h2 className="text-base font-bold text-ink">{group.name}</h2>
                        {group.specialization?.description && (
                          <p className="text-xs text-slate-500">{group.specialization.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-700">
                        {group.completed}/{group.total} منجز ({percent}%)
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Plus className="size-3.5" />}
                        onClick={() => {
                          setEditingTask(null);
                          setSelectedTrackId(group.specId);
                          setModalOpen(true);
                        }}
                      >
                        + إضافة مهمة للتراك
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-5">
                  <div className="grid grid-cols-1 gap-3">
                    {group.tasks.map((task) => renderTaskItem(task, true))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ------------------------------------------------------------------- */
        /* View 3: Flat List of All Tasks                                      */
        /* ------------------------------------------------------------------- */
        <div className="grid grid-cols-1 gap-3">
          {filteredTasks.map((task) => renderTaskItem(task, true))}
        </div>
      )}

      {/* Task Create / Edit Modal */}
      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={editingTask}
        defaultSpecializationId={
          selectedTrackId !== 'all' ? selectedTrackId : registeredSpecialization?.id
        }
        defaultSessionId={activeSessionForModal ?? (selectedSessionId !== 'all' ? selectedSessionId : undefined)}
        defaultMemberId={registeredMember?.id}
        specializations={specializations}
        sessions={sessions}
        members={members}
      />

      {/* Task Details Modal (Subtasks checklist & multi-task manager) */}
      <TaskDetailsModal
        task={currentDetailsTask}
        onClose={() => setViewingDetailsTask(null)}
        onEdit={(t) => {
          setEditingTask(t);
          setModalOpen(true);
        }}
        onDelete={(t) => handleDelete(t)}
        onToggleMain={(t) => toggleMutation.mutate({ id: t.id, completed: !t.is_completed })}
        specialization={currentDetailsTask ? specMap.get(currentDetailsTask.specialization_id) : undefined}
        session={currentDetailsTask?.session_id ? sessionMap.get(currentDetailsTask.session_id) : undefined}
        assignee={currentDetailsTask?.assigned_member_id ? memberMap.get(currentDetailsTask.assigned_member_id) : undefined}
      />
    </div>
  );
}
