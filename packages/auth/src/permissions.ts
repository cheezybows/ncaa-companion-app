import type { AppUser, AuthSession, TeamTenure, UserRole } from '@ncaa/domain';

export function canViewAllTeams(user: AppUser): boolean {
  return user.role === 'admin';
}

export function canApproveClaims(user: AppUser): boolean {
  return user.role === 'admin';
}

export function canSyncDynasty(user: AppUser): boolean {
  return user.role === 'admin';
}

export function canViewTeam(user: AppUser, teamId: string, tenures: TeamTenure[]): boolean {
  if (user.role === 'admin') return true;
  return tenures.some((tenure) => tenure.teamId === teamId);
}

export function getScopedTeamIds(
  session: AuthSession,
  allTeamIds: string[],
  userTenureTeamIds: string[] = []
): string[] {
  if (session.user.role === 'admin') return allTeamIds;
  if (userTenureTeamIds.length > 0) return userTenureTeamIds;
  if (!session.activeTenure) return [];
  return [session.activeTenure.teamId];
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'Commissioner';
    case 'coach':
      return 'Coach';
    case 'viewer':
      return 'Viewer';
    default:
      return role;
  }
}
