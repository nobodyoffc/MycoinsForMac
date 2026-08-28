import type {JSX} from 'react';
import {useEffect} from 'react';
import {NavLink, Outlet, useLocation, useNavigate} from 'react-router-dom';
import {CoinsIcon, SwapIcon, SettingsIcon} from '../components/TabIcons';
import {FloatingAvatar} from '../components/FloatingAvatar';
import {ApiPaymentHandler} from '../components/ApiPaymentHandler';
import {BackupReminder} from '../components/BackupReminder';

// /keys is reached from the FID badge rather than the sidebar, so it keeps the
// back button.
const ROOT_ROUTES = new Set(['/dashboard', '/swaps', '/settings']);

interface NavItem {
  to: string;
  label: string;
  icon: JSX.Element;
}

const NAV_ITEMS: NavItem[] = [
  {to: '/dashboard', label: 'Coins', icon: <CoinsIcon size={18} />},
  {to: '/swaps', label: 'Swap', icon: <SwapIcon size={18} />},
  {to: '/settings', label: 'Settings', icon: <SettingsIcon size={18} />},
];

export function MainShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const showBack = !ROOT_ROUTES.has(location.pathname);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === '[' && showBack) {
        e.preventDefault();
        navigate(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, showBack]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top" />
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({isActive}) =>
                `sidebar-item${isActive ? ' active' : ''}`
              }>
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <div className="main-titlebar" />
        <div className="main-scroll">
          <Outlet />
        </div>
        <FloatingAvatar />
        <ApiPaymentHandler />
        <BackupReminder />
        {showBack && (
          <button
            className="back-fab"
            title="Back (⌘[)"
            onClick={() => navigate(-1)}
            aria-label="Back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </main>
    </div>
  );
}
