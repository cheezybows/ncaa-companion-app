export interface CommissionerLeague {
  id: string;
  name: string;
  startingSeasonYear: number;
  status: 'active' | 'archived';
  commissionerUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCommissionerLeagueInput {
  name: string;
  startingSeasonYear: number;
  commissionerUserId?: string;
  id?: string;
}

export function slugifyLeagueName(name: string): string {
  return name
    .toLowerCase()
    .replaceAll('&', 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function leagueIdFromName(name: string): string {
  const slug = slugifyLeagueName(name);
  return slug ? `dynasty-${slug}` : `dynasty-${Date.now()}`;
}
