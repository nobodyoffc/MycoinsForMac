import {create} from 'zustand';
import {
  Account,
  ARGON2ID_PARAMS,
  deriveAccountId,
  deriveArgon2idSymkey,
  deriveLegacySymkey,
  generateSalt,
} from '../account/account';
import {KdfParams, KeyEntry, KeystoreManager} from '../account/keystore';
import {KeyManager} from '../account/key-manager';
import {CoinType} from '../coins/types';
import {bytesToHex, hexToBytes} from '../crypto/encoding';
import {getFCHCommonApi, getFCHLegacyApi} from '../api/api-registry';

function freshArgon2idParams(): KdfParams {
  return {
    salt: bytesToHex(generateSalt()),
    m: ARGON2ID_PARAMS.memoryKiB,
    t: ARGON2ID_PARAMS.iterations,
    p: ARGON2ID_PARAMS.parallelism,
  };
}

async function setupFchApiKeys(key: KeyEntry) {
  try {
    const commonApi = getFCHCommonApi();
    if (key.privateKey) {
      const privHex = bytesToHex(key.privateKey);
      // Timeout after 5 seconds — don't block login if FCH server is down
      await Promise.race([
        commonApi.init(privHex),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('FCH API timeout')), 5000),
        ),
      ]);
      // Also set client key on legacy API so encrypted POST works for serviceSearch
      const legacyApi = getFCHLegacyApi();
      legacyApi.setClientKey(privHex, key.addresses[CoinType.FCH] || '');
    }
  } catch (e: any) {
    console.warn('[setupFchApiKeys] FCH API not available:', e.message);
    // Login continues — FCH will show 0 balance, other coins still work
  }
}

interface AccountState {
  // Auth state
  isLoggedIn: boolean;
  currentAccount: Account | null;
  keyManager: KeyManager | null;
  keystoreManager: KeystoreManager | null;

  // Key state
  keys: KeyEntry[];
  activeKeyId: string | null;

  // Account list
  availableAccounts: string[]; // account IDs

  // Actions
  setKeystoreManager: (km: KeystoreManager) => void;
  login: (password: string) => Promise<boolean>;
  createNewAccount: (password: string) => Promise<void>;
  logout: () => void;
  refreshKeys: () => void;
  setActiveKey: (fchAddress: string) => void;
  addRandomKey: () => Promise<KeyEntry>;
  importKeyHex: (hex: string) => Promise<KeyEntry>;
  importKeyWIF: (wif: string) => Promise<KeyEntry>;
  importKeyFromSecret: (secret: string) => Promise<KeyEntry>;
  importPublicKey: (pubKeyHex: string) => Promise<KeyEntry>;
  importKeyCipher: (cipherJson: string, password: string) => Promise<KeyEntry>;
  markKeyBackedUp: (fchAddress: string) => Promise<void>;
  removeKey: (fchAddress: string) => Promise<void>;
  loadAvailableAccounts: () => Promise<void>;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  isLoggedIn: false,
  currentAccount: null,
  keyManager: null,
  keystoreManager: null,
  keys: [],
  activeKeyId: null,
  availableAccounts: [],

  setKeystoreManager: (km: KeystoreManager) => {
    set({keystoreManager: km});
  },

  login: async (password: string) => {
    const {keystoreManager} = get();
    if (!keystoreManager) {
      throw new Error('KeystoreManager not initialized');
    }

    const accountId = deriveAccountId(password);
    const meta = await keystoreManager.readMeta(accountId);
    if (!meta) {
      return false;
    }

    let symkey: Uint8Array;
    let kdfParams: KdfParams;
    const needsMigration = meta.kdf === 'sha256-legacy';

    if (meta.kdf === 'argon2id' && meta.kdfParams) {
      symkey = await deriveArgon2idSymkey(
        password,
        hexToBytes(meta.kdfParams.salt),
      );
      kdfParams = meta.kdfParams;
    } else {
      symkey = deriveLegacySymkey(password);
      kdfParams = freshArgon2idParams();
    }

    const account: Account = {id: accountId, symkey};
    const keyManager = new KeyManager(keystoreManager);

    try {
      await keyManager.loadAccount(account, kdfParams);
    } catch (e) {
      console.warn('[login] decryption failed', e);
      return false;
    }

    if (needsMigration) {
      const newSymkey = await deriveArgon2idSymkey(
        password,
        hexToBytes(kdfParams.salt),
      );
      await keyManager.rewrapAndSave(newSymkey, kdfParams);
    }

    const keys = keyManager.listKeys();
    const activeKeyId = keys.length > 0 ? keys[0].id : null;

    // Set up FCH common API encryption keys BEFORE setting logged in
    const activeKey = keys.find(k => k.id === activeKeyId);
    if (activeKey?.privateKey) {
      await setupFchApiKeys(activeKey);
    }

    set({
      isLoggedIn: true,
      currentAccount: account,
      keyManager,
      keys,
      activeKeyId,
    });

    return true;
  },

  createNewAccount: async (password: string) => {
    const {keystoreManager} = get();
    if (!keystoreManager) {
      throw new Error('KeystoreManager not initialized');
    }

    const accountId = deriveAccountId(password);
    const kdfParams = freshArgon2idParams();
    const symkey = await deriveArgon2idSymkey(
      password,
      hexToBytes(kdfParams.salt),
    );
    const account: Account = {id: accountId, symkey};
    const keyManager = new KeyManager(keystoreManager);
    keyManager.attachAccount(account, kdfParams);

    // Auto-generate a first key
    const firstKey = await keyManager.addRandomKey();

    // Set up FCH common API encryption keys BEFORE setting logged in
    if (firstKey.privateKey) {
      await setupFchApiKeys(firstKey);
    }

    set({
      isLoggedIn: true,
      currentAccount: account,
      keyManager,
      keys: keyManager.listKeys(),
      activeKeyId: firstKey.id,
    });

    // Refresh account list
    get().loadAvailableAccounts();
  },

  logout: () => {
    const {keyManager} = get();
    if (keyManager) {
      keyManager.clear();
    }
    set({
      isLoggedIn: false,
      currentAccount: null,
      keyManager: null,
      keys: [],
      activeKeyId: null,
    });
  },

  refreshKeys: () => {
    const {keyManager} = get();
    if (keyManager) {
      set({keys: keyManager.listKeys()});
    }
  },

  setActiveKey: (fchAddress: string) => {
    const {keyManager, keys} = get();
    if (keyManager) {
      keyManager.setActiveKey(fchAddress);
      set({activeKeyId: fchAddress});
      const key = keys.find(k => k.id === fchAddress);
      if (key?.privateKey) {
        setupFchApiKeys(key);
      }
    }
  },

  addRandomKey: async () => {
    const {keyManager} = get();
    if (!keyManager) {
      throw new Error('Not logged in');
    }
    const entry = await keyManager.addRandomKey();
    set({keys: keyManager.listKeys()});
    return entry;
  },

  importKeyHex: async (hex: string) => {
    const {keyManager} = get();
    if (!keyManager) {
      throw new Error('Not logged in');
    }
    const entry = await keyManager.importKeyHex(hex);
    set({keys: keyManager.listKeys()});
    return entry;
  },

  importKeyWIF: async (wif: string) => {
    const {keyManager} = get();
    if (!keyManager) {
      throw new Error('Not logged in');
    }
    const entry = await keyManager.importKeyWIF(wif);
    set({keys: keyManager.listKeys()});
    return entry;
  },

  importKeyFromSecret: async (secret: string) => {
    const {keyManager} = get();
    if (!keyManager) {
      throw new Error('Not logged in');
    }
    const entry = await keyManager.importKeyFromSecret(secret);
    set({keys: keyManager.listKeys()});
    return entry;
  },

  importPublicKey: async (pubKeyHex: string) => {
    const {keyManager} = get();
    if (!keyManager) {
      throw new Error('Not logged in');
    }
    const entry = await keyManager.importPublicKey(pubKeyHex);
    set({keys: keyManager.listKeys()});
    return entry;
  },

  importKeyCipher: async (cipherJson: string, password: string) => {
    const {keyManager} = get();
    if (!keyManager) {
      throw new Error('Not logged in');
    }
    const entry = await keyManager.importKeyCipher(cipherJson, password);
    set({keys: keyManager.listKeys()});
    return entry;
  },

  markKeyBackedUp: async (fchAddress: string) => {
    const {keyManager} = get();
    if (!keyManager) return;
    await keyManager.markBackedUp(fchAddress);
    set({keys: keyManager.listKeys()});
  },

  removeKey: async (fchAddress: string) => {
    const {keyManager, keystoreManager, currentAccount} = get();
    if (!keyManager) {
      throw new Error('Not logged in');
    }
    await keyManager.removeKey(fchAddress);
    const keys = keyManager.listKeys();

    if (keys.length === 0 && keystoreManager && currentAccount) {
      // No keys left — delete the account and logout
      await keystoreManager.delete(currentAccount.id);
      keyManager.clear();
      set({
        isLoggedIn: false,
        currentAccount: null,
        keyManager: null,
        keys: [],
        activeKeyId: null,
      });
      // Refresh account list
      const accounts = await keystoreManager.listAccounts();
      set({availableAccounts: accounts});
    } else {
      const active = keyManager.getActiveKey();
      set({keys, activeKeyId: active?.id || null});
    }
  },

  loadAvailableAccounts: async () => {
    const {keystoreManager} = get();
    if (keystoreManager) {
      const accounts = await keystoreManager.listAccounts();
      set({availableAccounts: accounts});
    }
  },
}));
