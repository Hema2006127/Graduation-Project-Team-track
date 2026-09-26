import { createBrowserRouter, Link, Navigate, Outlet, RouterProvider, useRouteError, type RouteObject } from 'react-router';
import type { Role } from '@/types';
import { AppLayout } from '@/components/layout/AppLayout';
import { PublicOnly, RequireRole } from '@/components/layout/Guards';
import { ErrorState, EmptyState } from '@/components/ui/Display';
import { LoginPage } from '@/pages/LoginPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { DashboardPage } from '@/pages/staff/DashboardPage';
import { SessionsPage } from '@/pages/staff/SessionsPage';
import { TakeAttendancePage } from '@/pages/staff/TakeAttendancePage';
import { TakeAttendanceIndexPage } from '@/pages/staff/TakeAttendanceIndexPage';
import { AttendancePage } from '@/pages/staff/AttendancePage';
import { ReportsPage } from '@/pages/staff/ReportsPage';
import { MemberDetailPage } from '@/pages/staff/MemberDetailPage';
import { MembersPage } from '@/pages/admin/MembersPage';
import { SpecializationsPage } from '@/pages/admin/SpecializationsPage';
import { SettingsPage } from '@/pages/admin/SettingsPage';

function RouteError() {
  const error = useRouteError();
  return (
    <div className="mx-auto max-w-xl p-6">
      <ErrorState error={error} onRetry={() => window.location.reload()} />
    </div>
  );
}

const NotFound = () => (
  <EmptyState title="Page not found" description="The page you are looking for doesn’t exist." action={<Link to="/" className="text-primary hover:underline">Go home</Link>} />
);

/** An area of the app restricted to `roles` (URL prefix per role). */
const area = (path: string, roles: Role[], children: RouteObject[]): RouteObject => ({
  path,
  element: (
    <RequireRole roles={roles}>
      <AppLayout />
    </RequireRole>
  ),
  children: [...children, { path: '*', element: <NotFound /> }],
});

const router = createBrowserRouter([
  {
    element: <Outlet />,
    errorElement: <RouteError />,
    children: [
      { path: '/login', element: <LoginPage /> },
      // Public, read-only site for everyone without an account.
      {
        path: '/',
        element: (
          <PublicOnly>
            <AppLayout />
          </PublicOnly>
        ),
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'sessions', element: <SessionsPage /> },
          { path: 'members', element: <MembersPage /> },
          { path: 'members/:id', element: <MemberDetailPage /> },
          { path: 'member/*', element: <Navigate to="/" replace /> },
          { path: '*', element: <NotFound /> },
        ],
      },
      area('/admin', ['admin'], [
        { index: true, element: <DashboardPage /> },
        { path: 'members', element: <MembersPage /> },
        { path: 'members/:id', element: <MemberDetailPage /> },
        { path: 'specializations', element: <SpecializationsPage /> },
        { path: 'sessions', element: <SessionsPage /> },
        { path: 'sessions/:id', element: <TakeAttendancePage /> },
        { path: 'attendance', element: <AttendancePage /> },
        { path: 'reports', element: <ReportsPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: 'profile', element: <ProfilePage /> },
      ]),
      area('/doctor', ['doctor'], [
        { index: true, element: <DashboardPage /> },
        { path: 'sessions', element: <SessionsPage /> },
        { path: 'sessions/:id', element: <TakeAttendancePage /> },
        { path: 'take-attendance', element: <TakeAttendanceIndexPage /> },
        { path: 'attendance', element: <AttendancePage /> },
        { path: 'reports', element: <ReportsPage /> },
        { path: 'members/:id', element: <MemberDetailPage /> },
        { path: 'profile', element: <ProfilePage /> },
      ]),
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
