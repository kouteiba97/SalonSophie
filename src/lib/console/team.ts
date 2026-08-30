import 'server-only';
import { cache } from 'react';

import type { StaffRole } from '@/lib/auth';
import { getSupabaseSessionClient } from '@/lib/supabase/session';
import { isDemoMode } from './demo';

/**
 * Who works here.
 *
 * `users_self_read` gives any signed-in user their own row and an owner every row in their tenant,
 * so this returns the whole team for an owner and a list of one for anybody else. The screen is
 * owner-gated anyway; this is the second lock rather than the first.
 */

export interface TeamMember {
  userId: string;
  fullName: string;
  email: string | null;
  role: StaffRole;
  isActive: boolean;
  /** Still on the temporary password an owner set — worth showing, it is an open door. */
  mustChangePassword: boolean;
  /** The bookable person this login belongs to, when it is linked to one. */
  staffSlug: string | null;
  staffName: string | null;
}

/** A bookable person with no login yet — the candidates a new account can be attached to. */
export interface BookablePerson {
  slug: string;
  displayName: string;
  hasAccount: boolean;
}

interface UserRow {
  id: string;
  full_name: string;
  email: string | null;
  role_key: StaffRole;
  is_active: boolean;
  must_change_password: boolean;
}

interface StaffRow {
  slug: string;
  display_name: string;
  user_id: string | null;
}

const DEMO_TEAM: TeamMember[] = [
  {
    userId: 'demo-owner',
    fullName: 'Sophie (démo)',
    email: 'sophie@example.dz',
    role: 'owner',
    isActive: true,
    mustChangePassword: false,
    staffSlug: 'sophie',
    staffName: 'Sophie',
  },
  {
    userId: 'demo-nour',
    fullName: 'Nour (démo)',
    email: 'nour@example.dz',
    role: 'owner',
    isActive: true,
    mustChangePassword: false,
    staffSlug: 'nour',
    staffName: 'Nour',
  },
  {
    userId: 'demo-reception',
    fullName: 'Réception (démo)',
    email: 'accueil@example.dz',
    role: 'reception',
    isActive: true,
    mustChangePassword: true,
    staffSlug: null,
    staffName: null,
  },
];

export const getTeam = cache(async (): Promise<TeamMember[]> => {
  if (isDemoMode()) return DEMO_TEAM;

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  const [users, staff] = await Promise.all([
    supabase
      .from('users')
      .select('id, full_name, email, role_key, is_active, must_change_password')
      .order('role_key')
      .order('full_name')
      .returns<UserRow[]>(),
    supabase.from('staff').select('slug, display_name, user_id').returns<StaffRow[]>(),
  ]);

  if (users.error || !users.data) return [];

  const byUser = new Map((staff.data ?? []).map((row) => [row.user_id, row]));

  return users.data.map((row) => {
    const linked = byUser.get(row.id);
    return {
      userId: row.id,
      fullName: row.full_name,
      email: row.email,
      role: row.role_key,
      isActive: row.is_active,
      mustChangePassword: row.must_change_password,
      staffSlug: linked?.slug ?? null,
      staffName: linked?.display_name ?? null,
    };
  });
});

/** Bookable people, so a new login can be attached to the person clients actually book. */
export const getBookablePeople = cache(async (): Promise<BookablePerson[]> => {
  if (isDemoMode()) {
    return [
      { slug: 'nour', displayName: 'Nour', hasAccount: true },
      { slug: 'sophie', displayName: 'Sophie', hasAccount: true },
    ];
  }

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('staff')
    .select('slug, display_name, user_id')
    .order('sort_order')
    .returns<StaffRow[]>();

  if (error || !data) return [];

  return data.map((row) => ({
    slug: row.slug,
    displayName: row.display_name,
    hasAccount: row.user_id !== null,
  }));
});
