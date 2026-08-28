import {Outlet} from 'react-router-dom';

export function AuthShell() {
  return (
    <div className="auth-shell">
      <Outlet />
    </div>
  );
}
