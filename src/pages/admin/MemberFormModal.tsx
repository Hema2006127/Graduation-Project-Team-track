import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import type { MemberInput, TeamMember } from '@/types';
import { api, errorMessage } from '@/services';
import { memberSchema, validate, type FieldErrors } from '@/lib/validation';
import { qk, useApiMutation, useMembers, useSpecializations } from '@/hooks/queries';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Form';
import { Avatar } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';

const EMPTY: MemberInput = { member_code: '', full_name: '', email: '', phone: null, avatar_url: null, specialization_id: '', status: 'active' };

function nextMemberCode(members: TeamMember[]) {
  const max = members.reduce((acc, m) => Math.max(acc, Number(/^TM(\d+)$/.exec(m.member_code)?.[1] ?? 0)), 0);
  return `TM${String(max + 1).padStart(3, '0')}`;
}

export function MemberFormModal({ open, onClose, member }: { open: boolean; onClose: () => void; member: TeamMember | null }) {
  const specs = useSpecializations().data ?? [];
  const members = useMembers().data ?? [];
  const toast = useToast();
  const [form, setForm] = useState<MemberInput>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const suggestedCode = nextMemberCode(members);
  const autoCode = useRef('');

  useEffect(() => {
    if (!open) return;
    setErrors({});
    autoCode.current = suggestedCode;
    setForm(member ? { ...member } : { ...EMPTY, member_code: suggestedCode });
  }, [open, member]);

  // If the member list finishes loading after the form opened, refresh the suggested ID (unless edited).
  useEffect(() => {
    if (!open || member) return;
    setForm((f) => (f.member_code === autoCode.current ? { ...f, member_code: suggestedCode } : f));
    autoCode.current = suggestedCode;
  }, [suggestedCode, open, member]);

  const save = useApiMutation(
    (input: MemberInput) => (member ? api.updateMember(member.id, input) : api.createMember(input)),
    {
      invalidate: [qk.members, qk.attendance],
      success: (m) => (member ? `Member updated — ${m.full_name}` : `Member added — ${m.full_name}`),
      errorTitle: member ? 'Could not update member' : 'Could not add member',
    },
  );

  const set = <K extends keyof MemberInput>(k: K, v: MemberInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return toast.error('Unsupported image', 'Use PNG, JPG or WebP.');
    setUploading(true);
    try {
      set('avatar_url', await api.uploadAvatar(file));
    } catch (e) {
      toast.error('Upload failed', errorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = validate(memberSchema, { ...form, phone: form.phone ?? '', avatar_url: form.avatar_url ?? '' });
    if (v.errors) return setErrors(v.errors);
    setErrors({});
    save.mutate(v.data, { onSuccess: onClose });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={member ? 'Edit team member' : 'Add team member'}
      description={member ? member.member_code : 'New active members are added to all upcoming sessions automatically.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="member-form" loading={save.isPending}>
            {member ? 'Save changes' : 'Add member'}
          </Button>
        </>
      }
    >
      <form id="member-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 sm:col-span-2">
          <Avatar name={form.full_name || '?'} src={form.avatar_url} size="lg" />
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button variant="secondary" size="sm" icon={<ImagePlus className="size-4" />} loading={uploading} onClick={() => fileRef.current?.click()}>
              {form.avatar_url ? 'Change photo' : 'Upload photo'}
            </Button>
            {form.avatar_url && (
              <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => set('avatar_url', null)}>
                Remove
              </Button>
            )}
            <p className="w-full text-xs text-slate-500">Optional · PNG, JPG or WebP up to 2 MB</p>
          </div>
        </div>
        <TextField label="Full name" required value={form.full_name} onChange={(e) => set('full_name', e.target.value)} error={errors.full_name} placeholder="Ahmed Mohamed" />
        <TextField label="Member ID" required value={form.member_code} onChange={(e) => set('member_code', e.target.value.toUpperCase())} error={errors.member_code} placeholder="TM001" />
        <TextField label="Email" required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} placeholder="name@example.com" hint="Used to link the member’s login account" />
        <TextField label="Phone" type="tel" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} error={errors.phone} placeholder="+20 100 000 0000" />
        <SelectField label="Specialization" required value={form.specialization_id ?? ''} onChange={(e) => set('specialization_id', e.target.value)} error={errors.specialization_id}>
          <option value="">Choose…</option>
          {specs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Status" value={form.status} onChange={(e) => set('status', e.target.value as MemberInput['status'])} hint="Inactive members are excluded from new sessions">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </SelectField>
      </form>
    </Modal>
  );
}
