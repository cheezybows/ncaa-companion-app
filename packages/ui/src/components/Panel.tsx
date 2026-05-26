import type { ReactNode } from 'react';

export type PanelAccent = 'teal' | 'gold' | 'amber' | 'rust' | 'neutral';

export type PanelProps = {
  children: ReactNode;
  className?: string;
  accent?: PanelAccent;
  full?: boolean;
};

const accentClass: Record<PanelAccent, string> = {
  teal: '',
  gold: 'panel--gold',
  amber: 'panel--amber',
  rust: 'panel--rust',
  neutral: 'panel--neutral',
};

export function Panel({ children, className, accent = 'teal', full }: PanelProps) {
  const classes = [
    'panel',
    accentClass[accent],
    full ? 'full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <div className={classes}>{children}</div>;
}
