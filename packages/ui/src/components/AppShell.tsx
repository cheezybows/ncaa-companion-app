import type { ReactNode } from 'react';

export type AppShellProps = {
  topbar?: ReactNode;
  sidebar: ReactNode;
  sidebarFooter?: ReactNode;
  children: ReactNode;
  /** e.g. `app--portal` for mobile responsive shell */
  className?: string;
};

export function AppShell({
  topbar,
  sidebar,
  sidebarFooter,
  children,
  className,
}: AppShellProps) {
  const rootClass = ['app', className].filter(Boolean).join(' ');
  return (
    <div className={rootClass}>
      <div className="app-body">
        <aside className="sidebar">
          {sidebar}
          {sidebarFooter}
        </aside>
        <div className="main-pane">
          {topbar && topbar}
          <main className="main-content">{children}</main>
        </div>
      </div>
    </div>
  );
}
