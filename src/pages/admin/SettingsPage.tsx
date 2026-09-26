import { useEffect, useState, type FormEvent } from 'react';
import { Building2, DatabaseZap, KeyRound, RotateCcw, UserCog } from 'lucide-react';
import type { Profile, Role, SettingsInput } from '@/types';
import { api } from '@/services';
import { resetDemoData } from '@/services/demo/demoApi';
import { settingsSchema, validate, type FieldErrors } from '@/lib/validation';
import { ROLE_LABEL } from '@/lib/permissions';
import { qk, useApiMutation, useProfiles, useSettings } from '@/hooks/queries';
import { useMe } from '@/context/AuthContext';
import { Badge, Card, ErrorState, PageHeader, Skeleton, TableWrap } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Form';
import { useConfirm } from '@/components/ui/Modal';

function OrganizationCard() {
  const settings = useSettings();
  const [form, setForm] = useState<SettingsInput>({ organization_name: '', timezone: 'UTC', low_attendance_threshold: 75 });
  const [errors, setErrors] = useState<FieldErrors>({});
  useEffect(() => {
    if (settings.data) setForm({ organization_name: settings.data.organization_name, timezone: settings.data.timezone, low_attendance_threshold: settings.data.low_attendance_threshold });
  }, [settings.data]);
  const save = useApiMutation(api.updateSettings, { invalidate: [qk.settings], success: 'Settings saved' });

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = validate(settingsSchema, form);
    if (v.errors) return setErrors(v.errors);
    setErrors({});
    save.mutate(v.data);
  }
  const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? ['UTC', 'Africa/Cairo'];

  return (
    <Card title={<span className="flex items-center gap-2 text-sm font-semibold"><Building2 className="size-4 text-slate-400" /> Organization</span>}>
      {settings.isLoading ? (
        <Skeleton className="h-32" />
      ) : (
        <form onSubmit={submit} noValidate className="grid gap-4 md:grid-cols-3">
          <TextField label="Team / organization name" value={form.organization_name} onChange={(e) => setForm({ ...form, organization_name: e.target.value })} error={errors.organization_name} />
          <SelectField label="Timezone" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} error={errors.timezone} hint="Session times and statuses use this timezone">
            {zones.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </SelectField>
          <TextField label="Low attendance threshold (%)" type="number" min={0} max={100} value={form.low_attendance_threshold} onChange={(e) => setForm({ ...form, low_attendance_threshold: Number(e.target.value) })} error={errors.low_attendance_threshold} />
          <div className="md:col-span-3">
            <Button type="submit" loading={save.isPending}>Save settings</Button>
          </div>
        </form>
      )}
    </Card>
  );
}


/**
 * Staff accounts are created in the Supabase dashboard (Authentication → Add user).
 * Here the admin can see them and change their role; "No access" blocks sign-in.
 */
function AccountsCard() {
  const me = useMe();
  const profiles = useProfiles();
  const confirm = useConfirm();
  const changeRole = useApiMutation(({ p, role }: { p: Profile; role: Role }) => api.updateProfile(p.id, { role, team_member_id: null }), {
    invalidate: [qk.profiles],
    success: (p) => (p.role === 'member' ? `${p.full_name} can no longer sign in` : `${p.full_name} is now ${ROLE_LABEL[p.role]}`),
    errorTitle: 'Could not change role',
  });

  if (profiles.error) return <ErrorState error={profiles.error} onRetry={profiles.refetch} />;
  return (
    <Card title={<span className="flex items-center gap-2 text-sm font-semibold"><UserCog className="size-4 text-slate-400" /> Staff accounts</span>} bodyClassName="p-0">
      <p className="border-b border-slate-100 px-5 py-3 text-sm text-slate-600">
        Only admin and doctor accounts can sign in; everyone else views the site without an account.
        {api.mode === 'supabase' && ' To add an account, open Supabase → Authentication → Users → Add user, then set its role here.'}
      </p>
      {profiles.isLoading ? (
        <Skeleton className="m-5 h-40" />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {(profiles.data ?? []).map((p) => {
                const self = p.id === me.id;
                return (
                  <tr key={p.id}>
                    <td>
                      <p className="font-medium text-ink">{p.full_name} {self && <Badge tone="blue">You</Badge>}</p>
                      <p className="text-xs text-slate-500">{p.email}</p>
                    </td>
                    <td>
                      <select
                        aria-label={`Role of ${p.full_name}`}
                        className="input h-8 w-auto py-0 pr-7 text-xs"
                        value={p.role}
                        disabled={self || changeRole.isPending}
                        onChange={async (e) => {
                          const role = e.target.value as Role;
                          const label = role === 'member' ? 'No access' : ROLE_LABEL[role];
                          if (await confirm({ title: 'Change permissions?', message: `${p.full_name} will become: ${label}.`, confirmLabel: 'Change role', tone: 'primary' })) changeRole.mutate({ p, role });
                        }}
                      >
                        <option value="admin">Admin</option>
                        <option value="doctor">Doctor</option>
                        <option value="member">No access</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}

export function SettingsPage() {
  const confirm = useConfirm();
  return (
    <>
      <PageHeader title="Settings" description="System configuration, accounts and permissions (admin only)." />
      <div className="space-y-6">
        <OrganizationCard />
        <AccountsCard />
        {api.mode === 'demo' ? (
          <Card title={<span className="flex items-center gap-2 text-sm font-semibold"><DatabaseZap className="size-4 text-slate-400" /> Demo data</span>}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">Restore the original sample members, sessions and attendance. All changes made in this browser are lost.</p>
              <Button
                variant="danger"
                icon={<RotateCcw className="size-4" />}
                onClick={async () => {
                  if (await confirm({ title: 'Reset demo data?', message: 'Everything will be restored to the sample data and you will be signed out.', confirmLabel: 'Reset' })) {
                    await api.signOut();
                    resetDemoData();
                    window.location.assign('/login');
                  }
                }}
              >
                Reset demo data
              </Button>
            </div>
          </Card>
        ) : (
          <Card title={<span className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4 text-slate-400" /> Security</span>}>
            <p className="text-sm text-slate-600">Permissions are enforced by Postgres Row Level Security. Disable public sign-ups in Supabase Auth settings so only admins can create accounts.</p>
          </Card>
        )}
      </div>
    </>
  );
}
