import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { LayoutGrid, List, Pencil, Plus, Power, Trash2, Users } from 'lucide-react';
import clsx from 'clsx';
import type { TeamMember } from '@/types';
import { api } from '@/services';
import { memberStats, rateTone } from '@/lib/attendance';
import { qk, useApiMutation, useAttendanceData, useCan } from '@/hooks/queries';
import { useViewer } from '@/context/AuthContext';
import { Avatar, Card, EmptyState, ErrorState, MemberStatusBadge, PageHeader, RateBar, Skeleton, TableWrap } from '@/components/ui/Display';
import { Button, IconButton } from '@/components/ui/Button';
import { FilterSelect, SearchInput } from '@/components/ui/Form';
import { useConfirm } from '@/components/ui/Modal';
import { MemberFormModal } from './MemberFormModal';

export function MembersPage() {
  const { base } = useViewer();
  const perms = useCan();
  const d = useAttendanceData();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [spec, setSpec] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState<'table' | 'cards'>('table');
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const toggleStatus = useApiMutation((m: TeamMember) => api.updateMember(m.id, { status: m.status === 'active' ? 'inactive' : 'active' }), {
    invalidate: [qk.members, qk.attendance],
    success: (m) => (m.status === 'active' ? `${m.full_name} reactivated` : `${m.full_name} deactivated`),
  });
  const remove = useApiMutation((m: TeamMember) => api.deleteMember(m.id), {
    invalidate: [qk.members, qk.attendance],
    success: (_r, m) => `${m.full_name} deleted`,
    errorTitle: 'Could not delete member',
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return d.members
      .filter(
        (m) =>
          (!spec || m.specialization_id === spec || (m.specialization_ids && m.specialization_ids.includes(spec))) &&
          (!status || m.status === status),
      )
      .filter((m) => {
        if (!q) return true;
        const tracks = (m.specialization_ids && m.specialization_ids.length > 0 ? m.specialization_ids : [m.specialization_id]).map((id) => d.lookup.specName(id));
        return [m.full_name, m.member_code, m.email, ...tracks].some((f) => f.toLowerCase().includes(q));
      })
      .map((m) => ({ m, stats: d.index ? memberStats(d.index, m.id) : null }));
  }, [d.members, d.index, d.lookup, search, spec, status]);

  const openForm = (m: TeamMember | null) => {
    setEditing(m);
    setFormOpen(true);
  };

  async function onToggle(m: TeamMember) {
    if (m.status === 'active') {
      const ok = await confirm({
        title: `Deactivate ${m.full_name}?`,
        message: 'They will be removed from upcoming sessions and excluded from new ones. Their attendance history is kept.',
        confirmLabel: 'Deactivate',
      });
      if (!ok) return;
    }
    toggleStatus.mutate(m);
  }

  async function onDelete(m: TeamMember) {
    const ok = await confirm({
      title: `Delete ${m.full_name}?`,
      message: 'This permanently removes the member. Members with recorded attendance cannot be deleted — deactivate them instead to keep their history.',
      confirmLabel: 'Delete member',
    });
    if (ok) remove.mutate(m);
  }

  if (d.error) return <ErrorState error={d.error} onRetry={d.retry} />;

  const actions = (m: TeamMember) =>
    perms.manageMembers && (
      <div className="flex justify-end gap-0.5">
        <IconButton label={`Edit ${m.full_name}`} onClick={() => openForm(m)}>
          <Pencil className="size-4" />
        </IconButton>
        <IconButton label={m.status === 'active' ? `Deactivate ${m.full_name}` : `Activate ${m.full_name}`} onClick={() => onToggle(m)} className={m.status === 'active' ? 'hover:text-warning' : 'hover:text-success'}>
          <Power className="size-4" />
        </IconButton>
        <IconButton label={`Delete ${m.full_name}`} onClick={() => onDelete(m)} className="hover:bg-red-50 hover:text-danger">
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    );

  return (
    <>
      <PageHeader
        title="Team Members"
        description={`${d.members.filter((m) => m.status === 'active').length} active · ${d.members.filter((m) => m.status === 'inactive').length} inactive`}
        actions={
          perms.manageMembers && (
            <Button icon={<Plus className="size-4" />} onClick={() => openForm(null)}>
              Add member
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, ID or specialization" className="sm:w-80" />
        <div className="flex gap-2">
          <FilterSelect label="Specialization" value={spec} onChange={setSpec} className="flex-1 sm:flex-none">
            <option value="">All specializations</option>
            {d.specializations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Status" value={status} onChange={setStatus}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </FilterSelect>
        </div>
        <div className="ml-auto hidden rounded-lg border border-slate-300 bg-white p-0.5 sm:flex" role="group" aria-label="View">
          {(['table', 'cards'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={clsx('rounded-md p-1.5', view === v ? 'bg-slate-100 text-ink' : 'text-slate-400 hover:text-slate-600')} aria-label={v === 'table' ? 'Table view' : 'Card view'}>
              {v === 'table' ? <List className="size-4" /> : <LayoutGrid className="size-4" />}
            </button>
          ))}
        </div>
      </div>

      {d.isLoading ? (
        <Skeleton className="h-96" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="size-6" />}
            title={d.members.length ? 'No members match your filters' : 'No team members yet'}
            description={d.members.length ? 'Try a different search or clear the filters.' : 'Add your first team member to start tracking attendance.'}
            action={!d.members.length && perms.manageMembers && <Button icon={<Plus className="size-4" />} onClick={() => openForm(null)}>Add member</Button>}
          />
        </Card>
      ) : (
        <>
          {/* Cards on mobile, or when chosen */}
          <div className={clsx('grid gap-3 sm:grid-cols-2 xl:grid-cols-3', view === 'table' && 'sm:hidden')}>
            {rows.map(({ m, stats }) => (
              <div key={m.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={m.full_name} src={m.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <Link to={`${base}/members/${m.id}`} className="block truncate font-semibold text-ink hover:text-primary">
                      {m.full_name}
                    </Link>
                    <p className="truncate text-sm text-slate-500">
                      {(m.specialization_ids && m.specialization_ids.length > 0 ? m.specialization_ids : [m.specialization_id])
                        .map((id) => d.lookup.specName(id))
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                  </div>
                  <MemberStatusBadge status={m.status} />
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="font-mono text-xs text-slate-500">{m.member_code}</span>
                  <RateBar value={stats?.rate ?? null} tone={rateTone(stats?.rate ?? null, d.threshold)} />
                </div>
                {perms.manageMembers && <div className="mt-2 border-t border-slate-100 pt-2">{actions(m)}</div>}
              </div>
            ))}
          </div>

          <div className={clsx('card hidden overflow-hidden', view === 'table' && 'sm:block')}>
            <TableWrap>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Specialization</th>
                    <th>ID</th>
                    <th>Status</th>
                    <th>Attendance</th>
                    {perms.manageMembers && <th className="text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ m, stats }) => (
                    <tr key={m.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={m.full_name} src={m.avatar_url} size="sm" />
                          <div className="min-w-0">
                            <Link to={`${base}/members/${m.id}`} className="font-semibold text-ink hover:text-primary">
                              {m.full_name}
                            </Link>
                            {m.email && <p className="truncate text-xs text-slate-500">{m.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="text-slate-600">
                        {(m.specialization_ids && m.specialization_ids.length > 0 ? m.specialization_ids : [m.specialization_id])
                          .map((id) => d.lookup.specName(id))
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </td>
                      <td className="font-mono text-xs text-slate-600">{m.member_code}</td>
                      <td>
                        <MemberStatusBadge status={m.status} />
                      </td>
                      <td>
                        <RateBar value={stats?.rate ?? null} tone={rateTone(stats?.rate ?? null, d.threshold)} />
                      </td>
                      {perms.manageMembers && <td>{actions(m)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        </>
      )}

      <MemberFormModal open={formOpen} onClose={() => setFormOpen(false)} member={editing} />
    </>
  );
}
