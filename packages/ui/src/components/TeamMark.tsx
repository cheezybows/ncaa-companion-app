import { useState } from 'react';
import type { CSSProperties } from 'react';

export type TeamMarkSize = 'sm' | 'md' | 'lg';

export interface TeamMarkTeam {
  id: string;
  name: string;
  abbreviation?: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
}

export interface TeamMarkProps {
  team?: TeamMarkTeam | null;
  teamId?: string;
  name?: string;
  abbreviation?: string;
  size?: TeamMarkSize;
  className?: string;
}

export function TeamMark({
  team,
  teamId,
  name,
  abbreviation,
  size = 'md',
  className,
}: TeamMarkProps) {
  const resolvedTeamId = team?.id ?? teamId;
  const resolvedName = team?.name ?? name ?? resolvedTeamId ?? 'Team';
  const resolvedAbbreviation = team?.abbreviation ?? abbreviation ?? initials(resolvedName);
  const logoUrl = team?.logoUrl ?? (resolvedTeamId ? `/teams/${resolvedTeamId}.png` : undefined);
  const [imageFailed, setImageFailed] = useState(false);
  const style = {
    '--team-mark-primary': team?.primaryColor ?? '#1d4ed8',
    '--team-mark-secondary': team?.secondaryColor ?? '#f8fafc',
  } as CSSProperties;
  const classes = ['team-mark', `team-mark--${size}`, className].filter(Boolean).join(' ');

  return (
    <span className={classes} style={style} aria-label={resolvedName} title={resolvedName}>
      {logoUrl && !imageFailed ? (
        <img src={logoUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} />
      ) : (
        <span className="team-mark-fallback" aria-hidden="true">
          {resolvedAbbreviation.slice(0, 4)}
        </span>
      )}
    </span>
  );
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
}
