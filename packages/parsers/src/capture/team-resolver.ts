import { NCAA_TEAM_CATALOG } from '@ncaa/domain';

const ALIASES: Record<string, string> = {
  WIS: 'Wisconsin',
  KENT: 'Kent State',
  MINN: 'Minnesota',
  RUTG: 'Rutgers',
  PUR: 'Purdue',
  WSU: 'Washington State',
  ILL: 'Illinois',
  USC: 'USC',
  MD: 'Maryland',
  UCLA: 'UCLA',
  CINCY: 'Cincinnati',
  CIN: 'Cincinnati',
  ORE: 'Oregon',
  ALA: 'Alabama',
  LIB: 'Liberty',
  MISS: 'Ole Miss',
  PSU: 'Penn State',
  MICH: 'Michigan',
  NW: 'Northwestern',
  CONN: 'UConn',
  IOWA: 'Iowa',
  GA: 'Georgia',
  TEX: 'Texas',
  ND: 'Notre Dame',
  TAMU: 'Texas A&M',
  OSU: 'Ohio State',
  MIA: 'Miami',
  FSU: 'Florida State',
  LSU: 'LSU',
  CLEM: 'Clemson',
  TENN: 'Tennessee',
  KSU: 'Kansas State',
  BSU: 'Boise State',
  LOU: 'Louisville',
  ARIZ: 'Arizona',
  NCSU: 'NC State',
  VAN: 'Vanderbilt',
  STAN: 'Stanford',
  PITT: 'Pitt',
  NEB: 'Nebraska',
  MEM: 'Memphis',
  TCU: 'TCU',
  DUKE: 'Duke',
  USU: 'Utah State',
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('&', 'and')
    .replaceAll('(', '')
    .replaceAll(')', '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function teamIdFromKey(teamKey: string): string {
  return `team-${teamKey}`;
}

export function teamKeyFromId(teamId: string): string {
  return teamId.replace(/^team-/, '');
}

export function resolveTeamKeyFromName(opponentName: string): string | undefined {
  const trimmed = opponentName.trim();
  if (!trimmed) return undefined;

  const alias = ALIASES[trimmed.toUpperCase()];
  const normalized = alias ?? trimmed.replace(/^\(\d+\)\s*/, '').trim();

  const exact = NCAA_TEAM_CATALOG.find(
    (team) =>
      team.name.toLowerCase() === normalized.toLowerCase() ||
      team.abbreviation.toLowerCase() === normalized.toLowerCase()
  );
  if (exact) return teamKeyFromId(exact.id);

  const slug = slugify(normalized);
  const bySlug = NCAA_TEAM_CATALOG.find((team) => teamKeyFromId(team.id) === slug);
  if (bySlug) return slug;

  return slug || undefined;
}

export function resolveTeamIdFromName(opponentName: string): string | undefined {
  const key = resolveTeamKeyFromName(opponentName);
  return key ? teamIdFromKey(key) : undefined;
}
