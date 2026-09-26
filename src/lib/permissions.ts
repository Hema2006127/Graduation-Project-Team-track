/**
 * UI-level permission checks. These only decide what to SHOW — the database
 * (RLS policies, column privileges and triggers) is the real enforcement
 * layer, and demo mode mirrors the same rules in its local API.
 *
 * Only admins and doctors sign in. Everyone else is a 'guest' who views the
 * site without an account (read-only, no private fields).
 */
import type { Role } from '@/types';

export type Viewer = Role | 'guest';

const staff = (r: Viewer | undefined) => r === 'admin' || r === 'doctor';
const admin = (r: Viewer | undefined) => r === 'admin';

export const can = {
  manageMembers: admin,
  manageSpecializations: admin,
  manageSessions: staff,
  deleteSessions: admin,
  recordAttendance: staff,
  exportReports: staff,
  manageAccounts: admin,
  manageSettings: admin,
};

/** Roles that are allowed to sign in. */
export const canSignIn = (r: Role) => r === 'admin' || r === 'doctor';

export const ROLE_LABEL: Record<Viewer, string> = { admin: 'Admin', doctor: 'Doctor', member: 'Team Member', guest: 'Visitor' };

/** URL prefix of each area ('' = the public site at the root). */
export const ROLE_HOME: Record<Viewer, string> = { admin: '/admin', doctor: '/doctor', member: '', guest: '' };

/** Home page of an area (the public site's home is '/'). */
export const homePath = (v: Viewer) => ROLE_HOME[v] || '/';
