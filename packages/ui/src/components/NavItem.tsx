import { Link } from 'react-router-dom';

export type NavItemProps = {
  to: string;
  label: string;
  active?: boolean;
  end?: boolean;
};

export function NavItem({ to, label, active }: NavItemProps) {
  return (
    <Link className={active ? 'nav-link active' : 'nav-link'} to={to}>
      {label}
    </Link>
  );
}
