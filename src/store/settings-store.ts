import {create} from 'zustand';
import {load, Store} from '@tauri-apps/plugin-store';
import {CoinType} from '../coins/types';

const SETTINGS_FILE = 'settings.json';
const SETTINGS_KEY = 'settings';

interface APIEndpoint {
  baseUrl: string;
  apiKey?: string;
}

interface PersistedSettings {
  apiEndpoints: Partial<Record<CoinType, APIEndpoint>>;
  apiProviderTypes: Record<string, string>;
  customApiUrl: string;
  autoLockMinutes: number;
}

interface SettingsState extends PersistedSettings {
  loaded: boolean;

  setApiEndpoint: (coin: CoinType, endpoint: APIEndpoint) => void;
  setApiProviderType: (groupKey: string, presetKey: string) => void;
  setCustomApiUrl: (url: string) => void;
  setAutoLockMinutes: (minutes: number) => void;
  getApiEndpoint: (coin: CoinType) => APIEndpoint | undefined;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
}

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(SETTINGS_FILE, {autoSave: false, defaults: {}});
  }
  return storePromise;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  apiEndpoints: {},
  apiProviderTypes: {},
  customApiUrl: '',
  autoLockMinutes: 5,
  loaded: false,

  setApiEndpoint: (coin, endpoint) => {
    set(state => ({
      apiEndpoints: {...state.apiEndpoints, [coin]: endpoint},
    }));
    get().saveSettings();
  },

  setApiProviderType: (groupKey, presetKey) => {
    set(state => ({
      apiProviderTypes: {...state.apiProviderTypes, [groupKey]: presetKey},
    }));
    get().saveSettings();
  },

  setCustomApiUrl: url => {
    set({customApiUrl: url});
    get().saveSettings();
  },

  setAutoLockMinutes: minutes => {
    set({autoLockMinutes: minutes});
    get().saveSettings();
  },

  getApiEndpoint: coin => get().apiEndpoints[coin],

  loadSettings: async () => {
    try {
      const store = await getStore();
      const data = await store.get<PersistedSettings>(SETTINGS_KEY);
      if (data) {
        set({
          apiEndpoints: data.apiEndpoints || {},
          apiProviderTypes: data.apiProviderTypes || {},
          customApiUrl: data.customApiUrl || '',
          autoLockMinutes: data.autoLockMinutes ?? 5,
          loaded: true,
        });
      } else {
        set({loaded: true});
      }
    } catch (e) {
      console.warn('[settings] load failed:', e);
      set({loaded: true});
    }
  },

  saveSettings: async () => {
    const {apiEndpoints, apiProviderTypes, customApiUrl, autoLockMinutes} = get();
    try {
      const store = await getStore();
      await store.set(SETTINGS_KEY, {
        apiEndpoints,
        apiProviderTypes,
        customApiUrl,
        autoLockMinutes,
      });
      await store.save();
    } catch (e) {
      console.warn('[settings] save failed:', e);
    }
  },
}));
