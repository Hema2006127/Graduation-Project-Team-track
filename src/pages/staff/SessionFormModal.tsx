import { useEffect, useState, type FormEvent } from 'react';
import type { Session, SessionInput } from '@/types';
import { api } from '@/services';
import { sessionSchema, validate, type FieldErrors } from '@/lib/validation';
import { hhmm, todayIn } from '@/lib/dates';
import { qk, useApiMutation, useDoctors, useSettings, useSpecializations } from '@/hooks/queries';
import { useMe } from '@/context/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Form';

export function SessionFormModal({ open, onClose, session }: { open: boolean; onClose: () => void; session: Session | null }) {
  const me = useMe();
  const doctors = useDoctors().data;
  const specs = useSpecializations().data ?? [];
  const tz = useSettings().data?.timezone ?? 'UTC';
  const [form, setForm] = useState<SessionInput>(() => blank());
  const [errors, setErrors] = useState<FieldErrors>({});

  function blank(): SessionInput {
    return {
      title: '', description: null, session_date: todayIn(tz), start_time: '19:00', end_time: '20:00',
      doctor_id: me.role === 'doctor' ? me.id : '', team_group: 'Whole Team', location: null, notes: null,
    };
  }

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      session
        ? { ...session, start_time: hhmm(session.start_time), end_time: hhmm(session.end_time) }
        : { ...blank(), doctor_id: me.role === 'doctor' ? me.id : (doctors.find((p) => p.role === 'doctor')?.id ?? '') },
    );
  }, [open, session]);

  // Doctors may finish loading after the form opened: preselect one if none chosen yet.
  const defaultDoctor = me.role === 'doctor' ? me.id : (doctors.find((p) => p.role === 'doctor')?.id ?? '');
  useEffect(() => {
    if (open && !session && defaultDoctor) setForm((f) => (f.doctor_id ? f : { ...f, doctor_id: defaultDoctor }));
  }, [open, session, defaultDoctor]);

  const save = useApiMutation((input: SessionInput) => (session ? api.updateSession(session.id, input) : api.createSession(input)), {
    invalidate: [qk.sessions, qk.attendance],
    success: (s) => (session ? `Session updated — ${s.title}` : `Session created — ${s.title}`),
    errorTitle: session ? 'Could not update session' : 'Could not create session',
  });

  const set = <K extends keyof SessionInput>(k: K, v: SessionInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = validate(sessionSchema, { ...form, description: form.description ?? '', location: form.location ?? '', notes: form.notes ?? '', doctor_id: form.doctor_id ?? '' });
    if (v.errors) return setErrors(v.errors);
    setErrors({});
    save.mutate(v.data, { onSuccess: onClose });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={session ? 'Edit session' : 'Create session'}
      description={session ? undefined : 'All active team members are added to the session automatically.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="session-form" loading={save.isPending}>
            {session ? 'Save changes' : 'Create session'}
          </Button>
        </>
      }
    >
      <form id="session-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-6">
        <TextField className="sm:col-span-6" label="Session title" required value={form.title} onChange={(e) => set('title', e.target.value)} error={errors.title} placeholder="AI Model Meeting" />
        <TextField className="sm:col-span-2" label="Date" type="date" required value={form.session_date} onChange={(e) => set('session_date', e.target.value)} error={errors.session_date} />
        <TextField className="sm:col-span-2" label="Start time" type="time" required value={form.start_time} onChange={(e) => set('start_time', e.target.value)} error={errors.start_time} />
        <TextField className="sm:col-span-2" label="End time" type="time" required value={form.end_time} onChange={(e) => set('end_time', e.target.value)} error={errors.end_time} />
        <SelectField className="sm:col-span-3" label="Doctor" required value={form.doctor_id ?? ''} onChange={(e) => set('doctor_id', e.target.value)} error={errors.doctor_id}>
          <option value="">Choose…</option>
          {doctors.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
              {p.role === 'admin' ? ' (Admin)' : ''}
            </option>
          ))}
        </SelectField>
        <div className="sm:col-span-3">
          <TextField label="Team / Group" required list="team-groups" value={form.team_group} onChange={(e) => set('team_group', e.target.value)} error={errors.team_group} />
          <datalist id="team-groups">
            <option value="Whole Team" />
            {specs.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </div>
        <TextField className="sm:col-span-6" label="Location" value={form.location ?? ''} onChange={(e) => set('location', e.target.value)} error={errors.location} placeholder="Lab 204 or Online (Google Meet)" />
        <TextAreaField className="sm:col-span-3" label="Description" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} error={errors.description} />
        <TextAreaField className="sm:col-span-3" label="Notes" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} error={errors.notes} />
      </form>
    </Modal>
  );
}
