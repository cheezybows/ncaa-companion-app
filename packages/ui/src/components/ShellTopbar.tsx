import type { ReactNode } from 'react';

export type TopbarStat = {
  label: string;
  value: string;
  small?: boolean;
};

export type ShellTopbarProps = {
  logoSrc?: string;
  logoAlt?: string;
  title?: string;
  subtitle?: string;
  stats?: TopbarStat[];
  children?: ReactNode;
};

export function ShellTopbar({
  logoSrc,
  logoAlt = 'NCAA Commissioner App',
  title,
  subtitle,
  stats,
  children,
}: ShellTopbarProps) {
  return (
    <header className="topbar">
      {(logoSrc || title || subtitle) && (
        <div className="topbar-logo">
          {logoSrc && <img src={logoSrc} alt={logoAlt} />}
          {(title || subtitle) && (
            <div>
              {title && <div className="topbar-logo-title">{title}</div>}
              {subtitle && <div className="topbar-logo-sub">{subtitle}</div>}
            </div>
          )}
        </div>
      )}
      {stats && stats.length > 0 && (
        <div className="topbar-stats">
          {stats.map((stat) => (
            <div key={stat.label} className="topbar-stat">
              <span className="topbar-stat-label">{stat.label}</span>
              <span
                className={
                  stat.small ? 'topbar-stat-value topbar-stat-value--sm' : 'topbar-stat-value'
                }
              >
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      )}
      {children}
    </header>
  );
}
