import type { DynastyId, TeamId } from './types.js';

export type UserId = string;
export type CoachCareerId = string;
export type TeamTenureId = string;
export type TeamClaimId = string;
export type SyncBatchId = string;

export type UserRole = 'admin' | 'coach' | 'viewer';

export type TeamClaimStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';
export type TeamTenureStatus = 'active' | 'completed' | 'transferred';

export interface AppUser {
  id: UserId;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  accessStatus?: 'active' | 'disabled';
  passwordUpdatedAt?: string;
  passwordResetRequired?: boolean;
  temporaryPassword?: string;
}

export interface HostedDynasty {
  id: DynastyId;
  name: string;
  currentSeasonYear: number;
  commissionerUserId: UserId;
  teamIds: TeamId[];
  createdAt: string;
  updatedAt: string;
}

export interface CoachCareer {
  id: CoachCareerId;
  userId: UserId;
  dynastyId: DynastyId;
  displayName: string;
  startedAt: string;
  endedAt?: string;
}

export interface TeamTenure {
  id: TeamTenureId;
  careerId: CoachCareerId;
  userId: UserId;
  dynastyId: DynastyId;
  teamId: TeamId;
  role: UserRole;
  status: TeamTenureStatus;
  startSeasonYear: number;
  endSeasonYear?: number;
  label?: string;
}

export interface TeamClaim {
  id: TeamClaimId;
  dynastyId: DynastyId;
  teamId: TeamId;
  userId: UserId;
  status: TeamClaimStatus;
  requestedAt: string;
  reviewedAt?: string;
  reviewedByUserId?: UserId;
  inviteCode?: string;
  note?: string;
}

export interface SyncBatch {
  id: SyncBatchId;
  dynastyId: DynastyId;
  uploadedByUserId: UserId;
  source: 'electron' | 'manual';
  startedAt: string;
  completedAt?: string;
  status: 'pending' | 'completed' | 'failed';
  recordCounts: {
    teams: number;
    players: number;
    snapshots: number;
    scheduleGames: number;
    recruits: number;
  };
  errors: string[];
}

export interface AuthSession {
  user: AppUser;
  dynastyId: DynastyId;
  activeTenure?: TeamTenure;
  career?: CoachCareer;
}
