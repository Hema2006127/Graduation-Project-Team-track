import { useState, type FormEvent } from 'react';
import { KeyRound, Mail, Phone, UserCircle } from 'lucide-react';
import { api } from '@/services';
import { useAuth, useMe } from '@/context/AuthContext';
import { ROLE_LABEL } from '@/lib/permissions';
import { qk, useApiMutation, useMembers, useSpecializations } from '@/hooks/queries';
import { Avatar, Badge, Card, MemberStatusBadge, PageHeader } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Form';

export function ProfilePage() {
  const me = useMe();
  const { refresh } = useAuth();
  const member = (useMembers().data ?? []).find((m) => m.id === me.team_member_id);
  const specs = useSpecializations().data ?? [];
  const [name, setName] = useState(me.full_name);
  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [pwError, setPwError] = useState<string>();

  const saveName = useApiMutation((full_name: string) => api.updateProfile(me.id, { full_name }), {
    invalidate: [qk.profiles],
    success: 'Profile updated',
  });
  const changePw = useApiMutation((password: string) => api.changePassword(password), { invalidate: [], success: 'Password changed' });

  function submitName(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return;
    saveName.mutate(name.trim(), { onSuccess: () => refresh() });
  }
  function submitPw(e: FormEvent) {
    e.preventDefault();
    if (pw.next.length < 8) return setPwError('At least 8 characters');
    if (pw.next !== pw.confirm) return setPwError('Passwords do not match');
    setPwError(undefined);
    changePw.mutate(pw.next, { onSuccess: () => setPw({ next: '', confirm: '' }) });
  }

  return (
    <>
      <PageHeader title="My Profile" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card flex flex-col items-center p-6 text-center">
          <Avatar name={member?.full_name ?? me.full_name} src={member?.avatar_url} size="xl" />
          <h2 className="mt-3 text-lg font-bold text-ink">{me.full_name}</h2>
          <Badge tone="blue" className="mt-1">{ROLE_LABEL[me.role]}</Badge>
          <div className="mt-4 w-full space-y-2 border-t border-slate-100 pt-4 text-left text-sm text-slate-600">
            <p className="flex items-center gap-2"><Mail className="size-4 text-slate-400" /> {me.email}</p>
            {member && (
              <>
                <p className="flex items-center gap-2"><UserCircle className="size-4 text-slate-400" /> <span className="font-mono">{member.member_code}</span> · {specs.find((s) => s.id === member.specialization_id)?.name ?? '—'}</p>
                {member.phone && <p className="flex items-center gap-2"><Phone className="size-4 text-slate-400" /> {member.phone}</p>}
                <MemberStatusBadge status={member.status} />
              </>
            )}
          </div>
        </div>
        <div className="space-y-6 lg:col-span-2">
          <Card title="Display name">
            <form onSubmit={submitName} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" error={name.trim().length < 2 ? 'Name is required' : undefined} />
              <Button type="submit" loading={saveName.isPending} disabled={name.trim() === me.full_name}>Save</Button>
            </form>
          </Card>
          <Card title={<span className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4 text-slate-400" /> Change password</span>}>
            <form onSubmit={submitPw} noValidate className="grid gap-3 sm:grid-cols-2">
              <TextField label="New password" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} error={pwError} />
              <TextField label="Confirm password" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
              <div className="sm:col-span-2">
                <Button type="submit" loading={changePw.isPending}>Update password</Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
