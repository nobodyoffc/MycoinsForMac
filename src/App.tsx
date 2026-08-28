import type {JSX} from 'react';
import {useEffect, useState} from 'react';
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import './App.css';

import {KeystoreManager} from './account/keystore';
import {tauriFsStorage} from './storage/tauri-fs-storage';
import {useAccountStore} from './store/account-store';
import {useSettingsStore} from './store/settings-store';
import {initializeProviders} from './api/api-registry';
import {CoinType} from './coins/types';
import {startAppLifecycleMonitor} from './utils/app-lifecycle';

import {AuthShell} from './navigation/AuthShell';
import {MainShell} from './navigation/MainShell';
import {SettingsScreen} from './screens/SettingsScreen';
import {LoginScreen} from './screens/LoginScreen';
import {CreateAccountScreen} from './screens/CreateAccountScreen';
import {DashboardScreen} from './screens/DashboardScreen';
import {CoinDetailScreen} from './screens/CoinDetailScreen';
import {ReceiveScreen} from './screens/ReceiveScreen';
import {SendScreen} from './screens/SendScreen';
import {TxDetailScreen} from './screens/TxDetailScreen';
import {KeyListScreen} from './screens/KeyListScreen';
import {AddKeyScreen} from './screens/AddKeyScreen';
import {SwapListScreen} from './screens/SwapListScreen';
import {SwapDetailScreen} from './screens/SwapDetailScreen';

const DEFAULT_FCH_API = 'http://localhost:8081/APIP';

function RequireAuth({children}: {children: JSX.Element}) {
  const isLoggedIn = useAccountStore(s => s.isLoggedIn);
  const location = useLocation();
  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{from: location}} />;
  }
  return children;
}

function RedirectIfAuthed({children}: {children: JSX.Element}) {
  const isLoggedIn = useAccountStore(s => s.isLoggedIn);
  if (isLoggedIn) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        element={
          <RedirectIfAuthed>
            <AuthShell />
          </RedirectIfAuthed>
        }>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/create-account" element={<CreateAccountScreen />} />
      </Route>

      <Route
        element={
          <RequireAuth>
            <MainShell />
          </RequireAuth>
        }>
        <Route path="/dashboard" element={<DashboardScreen />} />
        <Route path="/coins/:coin" element={<CoinDetailScreen />} />
        <Route path="/coins/:coin/send" element={<SendScreen />} />
        <Route path="/coins/:coin/receive" element={<ReceiveScreen />} />
        <Route path="/coins/:coin/tx/:txid" element={<TxDetailScreen />} />
        <Route path="/keys" element={<KeyListScreen />} />
        <Route path="/keys/add" element={<AddKeyScreen />} />
        <Route path="/swaps" element={<SwapListScreen />} />
        <Route path="/swaps/:id" element={<SwapDetailScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  const setKeystoreManager = useAccountStore(s => s.setKeystoreManager);
  const loadAvailableAccounts = useAccountStore(s => s.loadAvailableAccounts);
  const loadSettings = useSettingsStore(s => s.loadSettings);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const keystoreManager = new KeystoreManager(tauriFsStorage);
    setKeystoreManager(keystoreManager);
    startAppLifecycleMonitor();

    (async () => {
      await loadSettings();
      const settings = useSettingsStore.getState();
      const btcEndpoint = settings.apiEndpoints[CoinType.BTC];
      const dogeEndpoint = settings.apiEndpoints[CoinType.DOGE];
      // The selected FCH endpoint is the source of truth (set by Settings for
      // both preset and custom URLs). customApiUrl is only a fallback for older
      // saved configs; reading it first would ignore a newer preset selection.
      const fchEndpoint = settings.apiEndpoints[CoinType.FCH];
      initializeProviders({
        fchBaseUrl: fchEndpoint?.baseUrl || settings.customApiUrl || DEFAULT_FCH_API,
        btcBaseUrl: btcEndpoint?.baseUrl,
        btcApiKey: btcEndpoint?.apiKey,
        dogeBaseUrl: dogeEndpoint?.baseUrl,
        dogeApiKey: dogeEndpoint?.apiKey,
      });
      await loadAvailableAccounts();
      setBooted(true);
    })();
  }, [setKeystoreManager, loadAvailableAccounts, loadSettings]);

  if (!booted) {
    return <div className="loading-shell">Loading…</div>;
  }

  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
