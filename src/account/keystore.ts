import {CoinType} from '../coins/types';
import {encryptToHex, decryptFromHex} from '../crypto/aes';
import {bytesToHex, hexToBytes} from '../crypto/encoding';

export interface KeyEntry {
  id: string; // FCH address
  privateKey: Uint8Array | null; // null for watch-only
  publicKey: Uint8Array;
  isWatchOnly: boolean;
  addresses: Record<CoinType, string>;
  backedUp: boolean; // user has revealed/exported the prikey at least once
}

export interface EncryptedKeyEntry {
  id: string;
  iv: string;
  ciphertext: string;
  publicKey: string; // hex-encoded (always stored unencrypted)
  isWatchOnly: boolean;
  addresses: Record<CoinType, string>;
  backedUp?: boolean; // absent in keystores written before this flag existed
}

export type KDF = 'argon2id' | 'sha256-legacy';

export interface KdfParams {
  salt: string; // hex
  m: number; // memory KiB
  t: number; // iterations
  p: number; // parallelism
}

export interface KeystoreFile {
  accountId: string;
  version: number;
  kdf?: KDF; // absent or 'sha256-legacy' for v1 files
  kdfParams?: KdfParams; // only present when kdf === 'argon2id'
  keys: EncryptedKeyEntry[];
}

export interface KeystoreMeta {
  kdf: KDF;
  kdfParams?: KdfParams;
}

export interface KeystoreLoadResult {
  keys: KeyEntry[];
  meta: KeystoreMeta;
}

export interface StorageBackend {
  read(path: string): Promise<string | null>;
  write(path: string, data: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  listFiles(directory: string): Promise<string[]>;
}

export const CURRENT_KEYSTORE_VERSION = 2;

export function encryptKeyEntry(
  entry: KeyEntry,
  symkey: Uint8Array,
): EncryptedKeyEntry {
  let iv = '';
  let ciphertext = '';

  if (!entry.isWatchOnly && entry.privateKey) {
    const encrypted = encryptToHex(entry.privateKey, symkey);
    iv = encrypted.iv;
    ciphertext = encrypted.ciphertext;
  }

  return {
    id: entry.id,
    iv,
    ciphertext,
    publicKey: bytesToHex(entry.publicKey),
    isWatchOnly: entry.isWatchOnly,
    addresses: entry.addresses,
    backedUp: entry.backedUp,
  };
}

export function decryptKeyEntry(
  encrypted: EncryptedKeyEntry,
  symkey: Uint8Array,
): KeyEntry {
  let privateKey: Uint8Array | null = null;

  if (!encrypted.isWatchOnly && encrypted.ciphertext) {
    privateKey = decryptFromHex(encrypted.iv, encrypted.ciphertext, symkey);
  }

  return {
    id: encrypted.id,
    privateKey,
    publicKey: hexToBytes(encrypted.publicKey),
    isWatchOnly: encrypted.isWatchOnly,
    addresses: encrypted.addresses,
    // Older keystores predate the flag; treat those keys as not yet backed up
    // so the user gets prompted once rather than silently never.
    backedUp: encrypted.backedUp === true,
  };
}

export function createKeystoreFile(
  accountId: string,
  keys: KeyEntry[],
  symkey: Uint8Array,
  kdfParams: KdfParams,
): KeystoreFile {
  return {
    accountId,
    version: CURRENT_KEYSTORE_VERSION,
    kdf: 'argon2id',
    kdfParams,
    keys: keys.map(k => encryptKeyEntry(k, symkey)),
  };
}

function readMetaFromFile(file: KeystoreFile): KeystoreMeta {
  if (file.kdf === 'argon2id' && file.kdfParams) {
    return {kdf: 'argon2id', kdfParams: file.kdfParams};
  }
  return {kdf: 'sha256-legacy'};
}

export class KeystoreManager {
  private storage: StorageBackend;
  private basePath: string;

  constructor(storage: StorageBackend, basePath: string = 'keystores') {
    this.storage = storage;
    this.basePath = basePath;
  }

  private keystorePath(accountId: string): string {
    return `${this.basePath}/${accountId}.json`;
  }

  async readMeta(accountId: string): Promise<KeystoreMeta | null> {
    const json = await this.storage.read(this.keystorePath(accountId));
    if (!json) return null;
    const file: KeystoreFile = JSON.parse(json);
    return readMetaFromFile(file);
  }

  async save(
    accountId: string,
    keys: KeyEntry[],
    symkey: Uint8Array,
    kdfParams: KdfParams,
  ): Promise<void> {
    const keystore = createKeystoreFile(accountId, keys, symkey, kdfParams);
    const json = JSON.stringify(keystore, null, 2);
    await this.storage.write(this.keystorePath(accountId), json);
  }

  async load(
    accountId: string,
    symkey: Uint8Array,
  ): Promise<KeystoreLoadResult | null> {
    const json = await this.storage.read(this.keystorePath(accountId));
    if (!json) return null;
    const file: KeystoreFile = JSON.parse(json);
    if (file.version > CURRENT_KEYSTORE_VERSION) {
      throw new Error(`Unsupported keystore version: ${file.version}`);
    }
    const meta = readMetaFromFile(file);
    const keys = file.keys.map(k => decryptKeyEntry(k, symkey));
    return {keys, meta};
  }

  async exists(accountId: string): Promise<boolean> {
    return this.storage.exists(this.keystorePath(accountId));
  }

  async delete(accountId: string): Promise<void> {
    return this.storage.delete(this.keystorePath(accountId));
  }

  async listAccounts(): Promise<string[]> {
    const files = await this.storage.listFiles(this.basePath);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  }
}
