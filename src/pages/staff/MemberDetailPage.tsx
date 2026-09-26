import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useAttendanceData, useCan } from '@/hooks/queries';
import { useViewer } from '@/context/AuthContext';
import { MemberAttendanceView } from '@/components/attendance/MemberAttendanceView';
import { EmptyState, ErrorState, PageHeader, PageLoader } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { MemberFormModal } from '../admin/MemberFormModal';

export function MemberDetailPage() {
  const { id } = useParams();
  const { role, base } = useViewer();
  const perms = useCan();
  const d = useAttendanceData();
  const [editing, setEditing] = useState(false);
  const member = d.members.find((m) => m.id === id);
  // Doctors reach profiles from the dashboard/reports; admins and visitors from the members list.
  const back = role === 'doctor' ? base : `${base}/members`;

  if (d.error) return <ErrorState error={d.error} onRetry={d.retry} />;
  if (d.isLoading || !d.index) return <PageLoader />;
  if (!member) return <EmptyState title="Member not found" description="The member may have been deleted." action={<Link to={back} className="text-primary hover:underline">Go back</Link>} />;

  return (
    <>
      <Link to={back} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink">
        <ArrowLeft className="size-4" /> Back
      </Link>
      <PageHeader
        title="Member Profile"
        actions={
          perms.manageMembers && (
            <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
              Edit member
            </Button>
          )
        }
      />
      <MemberAttendanceView member={member} data={d} />
      {perms.manageMembers && <MemberFormModal open={editing} onClose={() => setEditing(false)} member={member} />}
    </>
  );
}
