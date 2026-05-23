import type {
  AppUser,
  CoachCareer,
  HostedDynasty,
  TeamClaim,
  TeamTenure,
} from './access.js';
import { PLACEHOLDER_DYNASTY, PLACEHOLDER_TEAMS } from './placeholders.js';

export const DEMO_DYNASTY_ID = 'dynasty-demo';

export const DEMO_USERS: AppUser[] = [
  {
    id: 'user-admin',
    email: 'commissioner@dynasty.local',
    displayName: 'League Commissioner',
    role: 'admin',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-coach-carter',
    email: 'eli.carter@dynasty.local',
    displayName: 'Eli Carter',
    role: 'coach',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-coach-brooks',
    email: 'malik.brooks@dynasty.local',
    displayName: 'Malik Brooks',
    role: 'coach',
    createdAt: '2026-06-01T00:00:00Z',
  },
  {
    id: 'user-coach-reed',
    email: 'darius.reed@dynasty.local',
    displayName: 'Darius Reed',
    role: 'coach',
    createdAt: '2026-08-15T00:00:00Z',
  },
];

export const DEMO_HOSTED_DYNASTY: HostedDynasty = {
  id: DEMO_DYNASTY_ID,
  name: PLACEHOLDER_DYNASTY.name,
  currentSeasonYear: PLACEHOLDER_DYNASTY.currentSeasonYear,
  commissionerUserId: 'user-admin',
  teamIds: PLACEHOLDER_TEAMS.map((team) => team.id),
  createdAt: PLACEHOLDER_DYNASTY.createdAt,
  updatedAt: PLACEHOLDER_DYNASTY.updatedAt,
};

export const DEMO_CAREERS: CoachCareer[] = [
  {
    id: 'career-carter',
    userId: 'user-coach-carter',
    dynastyId: DEMO_DYNASTY_ID,
    displayName: 'Eli Carter',
    startedAt: '2026-08-01T00:00:00Z',
  },
  {
    id: 'career-brooks',
    userId: 'user-coach-brooks',
    dynastyId: DEMO_DYNASTY_ID,
    displayName: 'Malik Brooks',
    startedAt: '2027-08-01T00:00:00Z',
  },
  {
    id: 'career-reed',
    userId: 'user-coach-reed',
    dynastyId: DEMO_DYNASTY_ID,
    displayName: 'Darius Reed',
    startedAt: '2026-08-01T00:00:00Z',
  },
];

export const DEMO_TENURES: TeamTenure[] = [
  {
    id: 'tenure-carter-bama',
    careerId: 'career-carter',
    userId: 'user-coach-carter',
    dynastyId: DEMO_DYNASTY_ID,
    teamId: 'team-alabama',
    role: 'coach',
    status: 'active',
    startSeasonYear: 2026,
    label: 'Assigned by commissioner',
  },
  {
    id: 'tenure-brooks-bama',
    careerId: 'career-brooks',
    userId: 'user-coach-brooks',
    dynastyId: DEMO_DYNASTY_ID,
    teamId: 'team-alabama',
    role: 'coach',
    status: 'completed',
    startSeasonYear: 2027,
    endSeasonYear: 2028,
    label: 'Alabama OC stint',
  },
  {
    id: 'tenure-brooks-osu',
    careerId: 'career-brooks',
    userId: 'user-coach-brooks',
    dynastyId: DEMO_DYNASTY_ID,
    teamId: 'team-ohio-state',
    role: 'coach',
    status: 'active',
    startSeasonYear: 2029,
    label: 'Assigned by commissioner',
  },
  {
    id: 'tenure-reed-uga',
    careerId: 'career-reed',
    userId: 'user-coach-reed',
    dynastyId: DEMO_DYNASTY_ID,
    teamId: 'team-georgia',
    role: 'coach',
    status: 'active',
    startSeasonYear: 2026,
    label: 'Assigned by commissioner',
  },
];

export const DEMO_CLAIMS: TeamClaim[] = [
  {
    id: 'claim-pending-osu',
    dynastyId: DEMO_DYNASTY_ID,
    teamId: 'team-ohio-state',
    userId: 'user-coach-carter',
    status: 'pending',
    requestedAt: '2029-05-01T12:00:00Z',
    note: 'Requesting Ohio State for 2029 season move.',
  },
];

export function getActiveTenureForUser(userId: string, dynastyId: string = DEMO_DYNASTY_ID): TeamTenure | undefined {
  return DEMO_TENURES.find(
    (tenure) =>
      tenure.userId === userId &&
      tenure.dynastyId === dynastyId &&
      tenure.status === 'active'
  );
}

export function getTenuresForUser(userId: string, dynastyId: string = DEMO_DYNASTY_ID): TeamTenure[] {
  return DEMO_TENURES.filter(
    (tenure) => tenure.userId === userId && tenure.dynastyId === dynastyId
  );
}

export function getAvailableTeamsForClaim(dynastyId: string = DEMO_DYNASTY_ID): string[] {
  const claimedTeamIds = new Set(
    DEMO_TENURES.filter((t) => t.dynastyId === dynastyId && t.status === 'active').map((t) => t.teamId)
  );
  const pendingClaims = new Set(
    DEMO_CLAIMS.filter((c) => c.dynastyId === dynastyId && c.status === 'pending').map((c) => c.teamId)
  );
  return DEMO_HOSTED_DYNASTY.teamIds.filter(
    (teamId) => !claimedTeamIds.has(teamId) && !pendingClaims.has(teamId)
  );
}
