import type {
  AuthSession,
  AppUser,
  Dynasty,
  DynastyCheckpoint,
  PlayerCatalogEntry,
  PlayerProgression,
  PostseasonResult,
  RankingSnapshot,
  Roster,
  SyncBatch,
  Team,
  TeamClaim,
  TeamTenure,
} from '@ncaa/domain';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8787';

export interface DynastyBundle {
  dynasty: Dynasty;
  teams: Team[];
  rosters: Record<string, Roster>;
  progression: PlayerProgression[];
  checkpoints?: DynastyCheckpoint[];
  playerCatalog?: PlayerCatalogEntry[];
  postseasonResults?: PostseasonResult[];
  rankings?: RankingSnapshot[];
  teamTenures?: TeamTenure[];
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
  } catch (error) {
    throw error instanceof Error ? error : new Error('Sign in failed');
  }
}

export async function fetchSession(userId: string): Promise<AuthSession> {
  return request<AuthSession>(`/auth/session/${userId}`);
}

export async function fetchDynastyBundle(dynastyId: string) {
  return request<DynastyBundle>(`/dynasties/${dynastyId}`);
}

export function fallbackDynastyBundle(): DynastyBundle {
  const now = new Date().toISOString();
  const currentSeasonYear = new Date().getFullYear();
  return {
    dynasty: {
      id: 'dynasty-unpublished',
      name: 'No dynasty published',
      currentSeasonYear,
      seasons: [],
      rankings: [],
      recruitingClasses: [],
      teamRosterSnapshots: [],
      checkpoints: [],
      playerCatalog: [],
      postseasonResults: [],
      createdAt: now,
      updatedAt: now,
    },
    teams: [],
    rosters: {},
    progression: [],
    rankings: [],
    syncBatches: [],
    importState: null,
  };
}

export async function fetchClaims(dynastyId: string): Promise<TeamClaim[]> {
  try {
    return await request<TeamClaim[]>(`/dynasties/${dynastyId}/claims`);
  } catch {
    return [];
  }
}

export async function fetchAvailableTeams(dynastyId: string): Promise<string[]> {
  try {
    const data = await request<{ teamIds: string[] }>(`/dynasties/${dynastyId}/available-teams`);
    return data.teamIds;
  } catch {
    return [];
  }
}

export async function fetchAssignableTeams(dynastyId: string, userId: string): Promise<string[]> {
  try {
    const data = await request<{ teamIds: string[] }>(
      `/dynasties/${dynastyId}/assignable-teams?userId=${userId}`
    );
    return data.teamIds;
  } catch {
    return [];
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
    return [];
  }
}

export async function fetchUsers(): Promise<AppUser[]> {
  try {
    return await request<AppUser[]>('/users');
  } catch {
    return [];
  }
}

