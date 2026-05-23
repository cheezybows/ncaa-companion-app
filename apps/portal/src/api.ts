import type {
  AuthSession,
  Roster,
  SyncBatch,
  Team,
  TeamClaim,
  TeamTenure,
} from '@ncaa/domain';
import {
  PLACEHOLDER_DYNASTY,
  PLACEHOLDER_PROGRESSION,
  PLACEHOLDER_ROSTERS,
  PLACEHOLDER_TEAMS,
} from '@ncaa/domain';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8787';

export interface DynastyBundle {
  dynasty: typeof PLACEHOLDER_DYNASTY;
  teams: Team[];
  rosters: Record<string, Roster>;
  progression: typeof PLACEHOLDER_PROGRESSION;
  syncBatches: SyncBatch[];
  importState: unknown;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${path}`);
  }
  return response.json() as Promise<T>;
}

export async function signIn(userId: string, password: string): Promise<AuthSession> {
  try {
    return await request<AuthSession>('/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({ userId, password }),
    });
  } catch {
    if (password !== 'password') throw new Error('Invalid demo password');
    const { signInAsUserId } = await import('@ncaa/auth');
    const session = signInAsUserId(userId);
    if (!session) throw new Error('Sign in failed');
    return session;
  }
}

export async function fetchDynastyBundle(dynastyId: string) {
  try {
    return await request<DynastyBundle>(`/dynasties/${dynastyId}`);
  } catch {
    return {
      dynasty: PLACEHOLDER_DYNASTY,
      teams: PLACEHOLDER_TEAMS,
      rosters: PLACEHOLDER_ROSTERS,
      progression: PLACEHOLDER_PROGRESSION,
      syncBatches: [],
      importState: null,
    } satisfies DynastyBundle;
  }
}

export async function fetchClaims(dynastyId: string): Promise<TeamClaim[]> {
  try {
    return await request<TeamClaim[]>(`/dynasties/${dynastyId}/claims`);
  } catch {
    const { DEMO_CLAIMS } = await import('@ncaa/domain');
    return DEMO_CLAIMS;
  }
}

export async function fetchAvailableTeams(dynastyId: string): Promise<string[]> {
  try {
    const data = await request<{ teamIds: string[] }>(`/dynasties/${dynastyId}/available-teams`);
    return data.teamIds;
  } catch {
    const { getAvailableTeamsForClaim } = await import('@ncaa/domain');
    return getAvailableTeamsForClaim(dynastyId);
  }
}

export async function fetchAssignableTeams(dynastyId: string, userId: string): Promise<string[]> {
  try {
    const data = await request<{ teamIds: string[] }>(
      `/dynasties/${dynastyId}/assignable-teams?userId=${userId}`
    );
    return data.teamIds;
  } catch {
    const { DEMO_HOSTED_DYNASTY, DEMO_TENURES } = await import('@ncaa/domain');
    const occupiedByOthers = new Set(
      DEMO_TENURES.filter((tenure) => tenure.status === 'active' && tenure.userId !== userId).map(
        (tenure) => tenure.teamId
      )
    );
    return DEMO_HOSTED_DYNASTY.teamIds.filter((teamId) => !occupiedByOthers.has(teamId));
  }
}

export async function submitClaim(
  dynastyId: string,
  teamId: string,
  userId: string,
  note?: string
): Promise<TeamClaim> {
  return request<TeamClaim>(`/dynasties/${dynastyId}/claims`, {
    method: 'POST',
    body: JSON.stringify({ teamId, userId, note }),
  });
}

export async function approveClaim(dynastyId: string, claimId: string, reviewerId: string) {
  return request<TeamClaim>(`/dynasties/${dynastyId}/claims/${claimId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ reviewerId }),
  });
}

export async function rejectClaim(dynastyId: string, claimId: string, reviewerId: string) {
  return request<TeamClaim>(`/dynasties/${dynastyId}/claims/${claimId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reviewerId }),
  });
}

export async function fetchTenures(userId: string, dynastyId: string): Promise<TeamTenure[]> {
  try {
    return await request<TeamTenure[]>(`/users/${userId}/tenures?dynastyId=${dynastyId}`);
  } catch {
    const { getTenuresForUser } = await import('@ncaa/domain');
    return getTenuresForUser(userId, dynastyId);
  }
}

