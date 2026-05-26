import type { AppUser, AuthSession } from '@ncaa/domain';
import {
  DEMO_CAREERS,
  DEMO_DYNASTY_ID,
  DEMO_USERS,
  getActiveTenureForUser,
} from '@ncaa/domain';

const SESSION_KEY = 'ncaa-companion-session';

export function buildSession(user: AppUser, dynastyId: string = DEMO_DYNASTY_ID): AuthSession {
  const career = DEMO_CAREERS.find((c) => c.userId === user.id && c.dynastyId === dynastyId);
  const activeTenure = getActiveTenureForUser(user.id, dynastyId);
  return { user, dynastyId, career, activeTenure };
}

export function signInAsUserId(userId: string): AuthSession | null {
  const user = DEMO_USERS.find((u) => u.id === userId);
  if (!user) return null;
  const session = buildSession(user);
  saveSession(session);
  return session;
}

export function saveSession(session: AuthSession): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
}

export function loadSession(): AuthSession | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed.user?.id || !parsed.user.displayName || !parsed.dynastyId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(SESSION_KEY);
  }
}

export function listDemoUsers(): AppUser[] {
  return DEMO_USERS;
}
