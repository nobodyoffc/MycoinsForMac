import {useEffect, useState} from 'react';
import {useAccountStore} from '../store/account-store';
import {useSettingsStore} from '../store/settings-store';
import {useWalletStore} from '../store/wallet-store';
import {CoinType} from '../coins/types';
import {coinColor} from '../utils/format';
import {bytesToHex} from '../crypto/encoding';
import {Avatar} from '../components/Avatar';
import {BackupPrikeyDialog} from '../components/BackupPrikeyDialog';
import {BlockCypherAPI} from '../api/providers/blockcypher';
import {BlockchairAPI} from '../api/providers/blockchair';
import {EthereumAPI} from '../api/providers/ethereum';
import {setProvider, reinitializeFchProviders} from '../api/api-registry';

interface Preset {
  key: string;
  label: string;
  url: string;
  provider: 'blockcypher' | 'blockchair' | 'ethereum' | 'fch';
  showApiKey: boolean;
  apiKeyLabel?: string;
  default?: boolean;
}

interface ApiGroup {
  key: string;
  label: string;
  coins: CoinType[];
  color: string;
  desc: string;
  presets: Preset[];
}

const API_GROUPS: ApiGroup[] = [
  {
    key: 'fch',
    label: 'FCH (Freecash)',
    coins: [CoinType.FCH],
    color: coinColor(CoinType.FCH),
    desc: 'Freecash API server with encrypted requests.',
    presets: [
      {key: 'fch_default', label: 'Freecash APIP', url: 'http://localhost:8081/APIP', provider: 'fch', showApiKey: false, default: true},
      {key: 'custom', label: 'Custom URL…', url: '', provider: 'fch', showApiKey: false},
    ],
  },
  {
    key: 'btc',
    label: 'BTC (Bitcoin)',
    coins: [CoinType.BTC],
    color: coinColor(CoinType.BTC),
    desc: 'API provider for Bitcoin.',
    presets: [
      {key: 'blockcypher', label: 'BlockCypher', url: 'https://api.blockcypher.com/v1', provider: 'blockcypher', showApiKey: true, default: true},
      {key: 'blockchair', label: 'Blockchair', url: 'https://api.blockchair.com', provider: 'blockchair', showApiKey: true},
      {key: 'custom', label: 'Custom URL…', url: '', provider: 'blockcypher', showApiKey: true},
    ],
  },
  {
    key: 'doge',
    label: 'DOGE (Dogecoin)',
    coins: [CoinType.DOGE],
    color: coinColor(CoinType.DOGE),
    desc: 'API provider for Dogecoin.',
    presets: [
      {key: 'blockcypher', label: 'BlockCypher', url: 'https://api.blockcypher.com/v1', provider: 'blockcypher', showApiKey: true, default: true},
      {key: 'blockchair', label: 'Blockchair', url: 'https://api.blockchair.com', provider: 'blockchair', showApiKey: true},
      {key: 'custom', label: 'Custom URL…', url: '', provider: 'blockcypher', showApiKey: true},
    ],
  },
  {
    key: 'bch',
    label: 'BCH (Bitcoin Cash)',
    coins: [CoinType.BCH],
    color: coinColor(CoinType.BCH),
    desc: 'API provider for Bitcoin Cash.',
    presets: [
      {key: 'blockchair', label: 'Blockchair', url: 'https://api.blockchair.com', provider: 'blockchair', showApiKey: true, default: true},
      {key: 'custom', label: 'Custom URL…', url: '', provider: 'blockchair', showApiKey: true},
    ],
  },
  {
    key: 'eth',
    label: 'ETH, USDT & USDC',
    coins: [CoinType.ETH, CoinType.USDT, CoinType.USDC],
    color: coinColor(CoinType.ETH),
    desc: 'Ethereum JSON-RPC for balances and broadcasting.',
    presets: [
      {key: 'publicnode', label: 'PublicNode', url: 'https://ethereum-rpc.publicnode.com', provider: 'ethereum', showApiKey: true, apiKeyLabel: 'Etherscan API Key (for TX history)', default: true},
      {key: 'ankr', label: 'Ankr', url: 'https://rpc.ankr.com/eth', provider: 'ethereum', showApiKey: true, apiKeyLabel: 'Etherscan API Key (for TX history)'},
      {key: 'custom', label: 'Custom URL…', url: '', provider: 'ethereum', showApiKey: true, apiKeyLabel: 'Etherscan API Key (for TX history)'},
    ],
  },
];

function getDefaultPresetKey(group: ApiGroup): string {
  return group.presets.find(p => p.default)?.key || group.presets[0].key;
}

interface GroupState {
  url: string;
  apiKey: string;
}

export function SettingsScreen() {
  const currentAccount = useAccountStore(s => s.currentAccount);
  const keys = useAccountStore(s => s.keys);
  const activeKeyId = useAccountStore(s => s.activeKeyId);
  const logout = useAccountStore(s => s.logout);
  const apiEndpoints = useSettingsStore(s => s.apiEndpoints);
  const apiProviderTypes = useSettingsStore(s => s.apiProviderTypes);
  const customApiUrl = useSettingsStore(s => s.customApiUrl);
  const autoLockMinutes = useSettingsStore(s => s.autoLockMinutes);
  const setApiEndpoint = useSettingsStore(s => s.setApiEndpoint);
  const setApiProviderType = useSettingsStore(s => s.setApiProviderType);
  const setCustomApiUrl = useSettingsStore(s => s.setCustomApiUrl);
  const setAutoLockMinutes = useSettingsStore(s => s.setAutoLockMinutes);
  const clearWallet = useWalletStore(s => s.clearWallet);

  const [backupKeyId, setBackupKeyId] = useState<string | null>(null);

  const [groups, setGroups] = useState<Record<string, GroupState>>({});
  const [selectedPresets, setSelectedPresets] = useState<Record<string, string>>({});
  const [savedStatus, setSavedStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    const initial: Record<string, GroupState> = {};
    const initialPresets: Record<string, string> = {};
    for (const group of API_GROUPS) {
      const firstCoin = group.coins[0];
      const endpoint = apiEndpoints[firstCoin];
      const savedPreset = apiProviderTypes[group.key];
      const presetKey = savedPreset || getDefaultPresetKey(group);
      const preset = group.presets.find(p => p.key === presetKey);
      initialPresets[group.key] = presetKey;
      initial[group.key] = {
        url:
          presetKey === 'custom'
            ? group.key === 'fch'
              ? customApiUrl || endpoint?.baseUrl || ''
              : endpoint?.baseUrl || ''
            : preset?.url || '',
        apiKey: endpoint?.apiKey || '',
      };
    }
    setGroups(initial);
    setSelectedPresets(initialPresets);
  }, [apiEndpoints, apiProviderTypes, customApiUrl]);

  const updateGroup = (key: string, field: 'url' | 'apiKey', value: string) => {
    setGroups(prev => ({...prev, [key]: {...prev[key], [field]: value}}));
  };

  const handlePresetChange = (group: ApiGroup, presetKey: string) => {
    setSelectedPresets(prev => ({...prev, [group.key]: presetKey}));
    if (presetKey !== 'custom') {
      const preset = group.presets.find(p => p.key === presetKey);
      if (preset) updateGroup(group.key, 'url', preset.url);
    }
  };

  const handleSaveGroup = (group: ApiGroup) => {
    const state = groups[group.key];
    if (!state) return;

    const presetKey = selectedPresets[group.key] || getDefaultPresetKey(group);
    const preset = group.presets.find(p => p.key === presetKey);
    const url = presetKey === 'custom' ? state.url.trim() : preset?.url || state.url.trim();
    const apiKey = state.apiKey.trim() || undefined;
    const providerType = preset?.provider || 'blockcypher';

    for (const coin of group.coins) {
      setApiEndpoint(coin, {baseUrl: url, apiKey});
    }
    setApiProviderType(group.key, presetKey);

    if (group.key === 'fch') {
      // Only persist customApiUrl for the custom preset; otherwise it would
      // shadow a later preset selection at startup (see App.tsx URL resolution).
      if (presetKey === 'custom') setCustomApiUrl(url);
      // Rebuild the live FCH providers so the new URL takes effect immediately
      // (instead of only after an app restart).
      const activeKey = keys.find(k => k.id === activeKeyId);
      const privHex = activeKey?.privateKey
        ? bytesToHex(activeKey.privateKey)
        : undefined;
      const fid = activeKey?.addresses[CoinType.FCH] || activeKey?.id;
      void reinitializeFchProviders(url, privHex, fid);
    }

    if (group.key === 'btc' || group.key === 'doge' || group.key === 'bch') {
      for (const coin of group.coins) {
        if (providerType === 'blockchair') {
          setProvider(coin, new BlockchairAPI(coin, {baseUrl: url, apiKey}));
        } else {
          setProvider(coin, new BlockCypherAPI(coin, {baseUrl: url, apiKey}));
        }
      }
    }

    if (group.key === 'eth') {
      for (const coin of group.coins) {
        setProvider(coin, new EthereumAPI(coin, {baseUrl: url, apiKey}));
      }
    }

    setSavedStatus(prev => ({...prev, [group.key]: 'Saved ✓'}));
    setTimeout(() => {
      setSavedStatus(prev => {
        const next = {...prev};
        delete next[group.key];
        return next;
      });
    }, 2000);
  };

  const handleLogout = () => {
    if (window.confirm('Log out of this account?')) {
      clearWallet();
      logout();
    }
  };

  const backupEligibleKeys = keys.filter(k => !k.isWatchOnly && k.privateKey);

  return (
    <div>
      <h1 className="page-title">Settings</h1>

      <div className="settings-section">
        <div className="section-title" style={{marginTop: 0}}>Account</div>
        <div className="info-row">
          <span className="label">Account ID</span>
          <span className="value">{currentAccount?.id || '-'}</span>
        </div>
      </div>

      <div className="settings-section">
        <div className="section-title" style={{marginTop: 0}}>Security</div>
        <div className="info-row">
          <div>
            <div className="label">Auto-lock when idle</div>
            <div
              style={{
                fontSize: 'var(--font-xs)',
                color: 'var(--color-text-secondary)',
                marginTop: 2,
              }}>
              Clear keys and log out when the window has been unfocused this
              long.
            </div>
          </div>
          <select
            value={autoLockMinutes}
            onChange={e => setAutoLockMinutes(Number(e.target.value))}
            style={{
              background: 'var(--color-background)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 'var(--font-sm)',
              color: 'var(--color-text)',
              outline: 'none',
              cursor: 'pointer',
            }}>
            <option value={0}>Never</option>
            <option value={1}>1 minute</option>
            <option value={5}>5 minutes</option>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
          </select>
        </div>
      </div>

      <div className="settings-section">
        <div className="section-title" style={{marginTop: 0}}>Backup Prikey</div>
        <p style={{color: 'var(--color-text-secondary)', fontSize: 'var(--font-sm)', margin: '0 0 var(--space-md) 0'}}>
          Pick an identity to view its QR code or copy the encrypted cipher.
        </p>

        {backupEligibleKeys.length === 0 ? (
          <div className="empty-state" style={{padding: 'var(--space-md) 0'}}>
            No prikeys available for backup.
          </div>
        ) : (
          <div className="fid-grid">
            {backupEligibleKeys.map(k => (
              <button
                key={k.id}
                className="fid-tile"
                onClick={() => setBackupKeyId(k.id)}>
                <Avatar address={k.id} size={40} />
                <span className="fid-tile-info">
                  <span className="fid-tile-id">
                    {k.id.slice(0, 6)}…{k.id.slice(-4)}
                  </span>
                  <span
                    className={`backup-badge${k.backedUp ? ' done' : ' pending'}`}>
                    {k.backedUp ? 'Backed Up' : 'Not Backed Up'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="section-title" style={{marginTop: 0}}>API Endpoints</div>
      <p style={{color: 'var(--color-text-secondary)', fontSize: 'var(--font-sm)', margin: '0 0 var(--space-md) 0'}}>
        Configure API servers for each blockchain. Leave empty to use defaults.
      </p>

      {API_GROUPS.map(group => {
        const state = groups[group.key] || {url: '', apiKey: ''};
        const presetKey = selectedPresets[group.key] || getDefaultPresetKey(group);
        const activePreset = group.presets.find(p => p.key === presetKey);
        const isCustom = presetKey === 'custom';
        return (
          <div key={group.key} className="api-card">
            <div className="api-card-header">
              <div className="coin-dot" style={{background: group.color}} />
              <div className="api-card-title">{group.label}</div>
            </div>
            <div className="api-card-desc">{group.desc}</div>

            <label className="field-label">Provider</label>
            <select
              value={presetKey}
              onChange={e => handlePresetChange(group, e.target.value)}>
              {group.presets.map(p => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>

            {!isCustom && activePreset && (
              <div className="preset-url">{activePreset.url}</div>
            )}

            {isCustom && (
              <>
                <label className="field-label">API URL</label>
                <input
                  className="mono"
                  type="url"
                  value={state.url}
                  onChange={e => updateGroup(group.key, 'url', e.target.value)}
                  placeholder="https://..."
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </>
            )}

            {activePreset?.showApiKey && (
              <>
                <label className="field-label">
                  {activePreset.apiKeyLabel || 'API Key (optional)'}
                </label>
                <input
                  className="mono"
                  type="text"
                  value={state.apiKey}
                  onChange={e => updateGroup(group.key, 'apiKey', e.target.value)}
                  placeholder="Leave empty for free tier"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </>
            )}

            <button
              className="save-btn"
              style={{background: group.color}}
              onClick={() => handleSaveGroup(group)}>
              Save
            </button>
            {savedStatus[group.key] && (
              <div className="inline-status ok">{savedStatus[group.key]}</div>
            )}
          </div>
        );
      })}

      <div className="settings-section" style={{marginTop: 'var(--space-xl)'}}>
        <div className="section-title" style={{marginTop: 0}}>About</div>
        <div className="info-row">
          <span className="label">App</span>
          <span className="value">MyCoins v0.1.1</span>
        </div>
      </div>

      <button className="logout-btn" onClick={handleLogout}>
        Logout
      </button>
      {backupKeyId && (
        <BackupPrikeyDialog
          keyId={backupKeyId}
          onClose={() => setBackupKeyId(null)}
        />
      )}
    </div>
  );
}
