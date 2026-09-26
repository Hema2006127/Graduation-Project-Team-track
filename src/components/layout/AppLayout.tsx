import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  CalendarDays, ClipboardCheck, FileSpreadsheet, History, LayoutDashboard, LogIn, LogOut, Menu, Settings,
  Tags, UserCircle, Users, X, type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth, useMe, useViewer } from '@/context/AuthContext';
import { homePath, ROLE_HOME, ROLE_LABEL, type Viewer } from '@/lib/permissions';
import { useSettings } from '@/hooks/queries';
import { api } from '@/services';
import { Avatar, Badge } from '@/components/ui/Display';
import { buttonClass } from '@/components/ui/Button';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: Record<Viewer, NavItem[]> = {
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/members', label: 'Team Members', icon: Users },
    { to: '/admin/specializations', label: 'Specializations', icon: Tags },
    { to: '/admin/sessions', label: 'Sessions', icon: CalendarDays },
    { to: '/admin/attendance', label: 'Attendance', icon: ClipboardCheck },
    { to: '/admin/reports', label: 'Reports', icon: FileSpreadsheet },
    { to: '/admin/settings', label: 'Settings', icon: Settings },
  ],
  doctor: [
    { to: '/doctor', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/doctor/sessions', label: 'Sessions', icon: CalendarDays },
    { to: '/doctor/take-attendance', label: 'Take Attendance', icon: ClipboardCheck },
    { to: '/doctor/attendance', label: 'Attendance History', icon: History },
    { to: '/doctor/reports', label: 'Reports', icon: FileSpreadsheet },
  ],
  // Visitors: read-only public site (no account needed)
  guest: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/sessions', label: 'Sessions', icon: CalendarDays },
    { to: '/members', label: 'Team Members', icon: Users },
  ],
  member: [],
};

function Sidebar({ role, onNavigate }: { role: Viewer; onNavigate?: () => void }) {
  const org = useSettings().data?.organization_name;
  return (
    <div className="flex h-full flex-col">
      <Link to={homePath(role)} onClick={onNavigate} className="flex items-center gap-3 px-5 py-5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
          <ClipboardCheck className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">Team Attendance</p>
          <p className="truncate text-xs text-slate-500">{org ?? 'Session tracking'}</p>
        </div>
      </Link>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Main">
        {NAV[role].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-blue-50 text-primary' : 'text-slate-600 hover:bg-slate-100 hover:text-ink',
              )
            }
          >
            <item.icon className="size-[18px] shrink-0" aria-hidden />
            {item.label}
          </NavLink>
        ))}
      </nav>
      {role === 'guest' && (
        <div className="m-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-semibold text-slate-700">View only</p>
          <p className="mt-0.5">You are viewing the team’s attendance. Only the admin and the doctor can make changes.</p>
        </div>
      )}
      {api.mode === 'demo' && (
        <div className="m-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-semibold">Demo mode</p>
          <p className="mt-0.5 text-amber-800">Data is stored in this browser. Connect Supabase for production.</p>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const me = useMe();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-slate-100"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="user-menu"
      >
        <Avatar name={me.full_name} size="sm" />
        <div className="hidden text-left sm:block">
          <p className="max-w-40 truncate text-sm font-semibold text-ink">{me.full_name}</p>
          <p className="text-xs text-slate-500">{ROLE_LABEL[me.role]}</p>
        </div>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-60 animate-pop-in rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="truncate text-sm font-semibold">{me.full_name}</p>
            <p className="truncate text-xs text-slate-500">{me.email}</p>
            <Badge tone="blue" className="mt-1.5">
              {ROLE_LABEL[me.role]}
            </Badge>
          </div>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate(`${ROLE_HOME[me.role]}/profile`);
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            <UserCircle className="size-4" /> My profile
          </button>
          <button
            role="menuitem"
            onClick={async () => {
              await signOut();
              navigate('/login', { replace: true });
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-red-50"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const { role } = useViewer();
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const title = [...NAV[role]].sort((a, b) => b.to.length - a.to.length).find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))?.label;

  useEffect(() => setDrawer(false), [location.pathname]);
  useEffect(() => {
    document.title = title ? `${title} · Team Attendance` : 'Team Attendance';
  }, [title]);

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <Sidebar role={role} />
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-slate-900/40" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-pop-in bg-white shadow-xl">
            <button onClick={() => setDrawer(false)} className="absolute top-5 right-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close menu">
              <X className="size-5" />
            </button>
            <Sidebar role={role} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header
          className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/85 px-4 backdrop-blur sm:px-6"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <button onClick={() => setDrawer(true)} className="-ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu" data-testid="open-menu">
            <Menu className="size-5" />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{title ?? ''}</p>
          {role === 'guest' ? (
            <Link to="/login" className={buttonClass('secondary', 'sm')} data-testid="staff-sign-in">
              <LogIn className="size-4" /> Staff sign in
            </Link>
          ) : (
            <UserMenu />
          )}
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
