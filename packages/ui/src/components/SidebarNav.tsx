import type { ReactNode } from 'react';

export type SidebarNavProps = {
  children: ReactNode;
};

export function SidebarNav({ children }: SidebarNavProps) {
  return <nav className="sidebar-nav">{children}</nav>;
}

export type SidebarBrandProps = {
  logoSrc?: string;
  logoAlt?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
};

export function SidebarBrand({
  logoSrc,
  logoAlt = 'NCAA Commissioner App',
  eyebrow,
  title,
  subtitle,
  children,
}: SidebarBrandProps) {
  return (
    <div className="sidebar-brand">
      {logoSrc && (
        <img className="sidebar-logo commissioner-logo" src={logoSrc} alt={logoAlt} />
      )}
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      {title && <h1>{title}</h1>}
      {subtitle && <p className="muted">{subtitle}</p>}
      {children}
    </div>
  );
}
