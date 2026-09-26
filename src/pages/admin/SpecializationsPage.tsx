import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import type { Specialization, SpecializationInput } from '@/types';
import { api } from '@/services';
import { specializationSchema, validate, type FieldErrors } from '@/lib/validation';
import { qk, useApiMutation, useMembers, useSpecializations } from '@/hooks/queries';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Display';
import { Button, IconButton } from '@/components/ui/Button';
import { SearchInput, TextAreaField, TextField } from '@/components/ui/Form';
import { Modal, useConfirm } from '@/components/ui/Modal';

function SpecializationModal({ open, onClose, item }: { open: boolean; onClose: () => void; item: Specialization | null }) {
  const [form, setForm] = useState<SpecializationInput>({ name: '', description: null });
  const [errors, setErrors] = useState<FieldErrors>({});
  useEffect(() => {
    if (open) {
      setForm(item ? { name: item.name, description: item.description } : { name: '', description: null });
      setErrors({});
    }
  }, [open, item]);

  const save = useApiMutation((input: SpecializationInput) => (item ? api.updateSpecialization(item.id, input) : api.createSpecialization(input)), {
    invalidate: [qk.specializations],
    success: (s) => (item ? `Specialization updated — ${s.name}` : `Specialization added — ${s.name}`),
    errorTitle: 'Could not save specialization',
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = validate(specializationSchema, { ...form, description: form.description ?? '' });
    if (v.errors) return setErrors(v.errors);
    save.mutate(v.data, { onSuccess: onClose });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={item ? 'Edit specialization' : 'Add specialization'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="spec-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="spec-form" onSubmit={submit} noValidate className="space-y-4">
        <TextField label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} placeholder="e.g. DevOps" />
        <TextAreaField label="Description" value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} error={errors.description} placeholder="What this sub-team works on" />
      </form>
    </Modal>
  );
}

export function SpecializationsPage() {
  const specs = useSpecializations();
  const members = useMembers().data ?? [];
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState<Specialization | null>(null);

  const remove = useApiMutation((s: Specialization) => api.deleteSpecialization(s.id), {
    invalidate: [qk.specializations],
    success: (_r, s) => `${s.name} deleted`,
    errorTitle: 'Could not delete specialization',
  });

  if (specs.error) return <ErrorState error={specs.error} onRetry={specs.refetch} />;
  const list = (specs.data ?? []).filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()));
  const edit = (s: Specialization | null) => {
    setItem(s);
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Specializations"
        description="Sub-teams used to group members in lists, charts and reports."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => edit(null)}>
            Add specialization
          </Button>
        }
      />
      <SearchInput value={search} onChange={setSearch} placeholder="Search specializations" className="mb-4 sm:w-80" />
      {specs.isLoading ? (
        <Skeleton className="h-64" />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={<Tags className="size-6" />} title={search ? 'No matches' : 'No specializations yet'} description={search ? 'Try another name.' : 'Create specializations such as Backend, Flutter or UI/UX.'} />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => {
            const count = members.filter((m) => m.specialization_id === s.id).length;
            const active = members.filter((m) => m.specialization_id === s.id && m.status === 'active').length;
            return (
              <div key={s.id} className="card flex flex-col p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
                    <Tags className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{s.name}</p>
                    <p className="line-clamp-2 text-sm text-slate-500">{s.description || 'No description'}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-sm text-slate-600">
                    <strong className="text-ink">{active}</strong> active{count > active ? ` · ${count - active} inactive` : ''}
                  </span>
                  <div className="flex">
                    <IconButton label={`Edit ${s.name}`} onClick={() => edit(s)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton
                      label={`Delete ${s.name}`}
                      className="hover:bg-red-50 hover:text-danger"
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Delete “${s.name}”?`,
                          message: count ? `${count} member(s) use this specialization. Reassign them before deleting.` : 'This cannot be undone.',
                          confirmLabel: 'Delete',
                        });
                        if (ok) remove.mutate(s);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <SpecializationModal open={open} onClose={() => setOpen(false)} item={item} />
    </>
  );
}
