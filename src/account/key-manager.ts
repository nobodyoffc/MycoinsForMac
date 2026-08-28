import {CoinType} from '../coins/types';
import {
  generateRandomPrivateKey,
  privateKeyFromHex,
  privateKeyFromWIF,
  privateKeyFromSecret,
  getPublicKey,
  publicKeyFromHex,
} from '../crypto/keys';
import {privateKeyToAddresses, publicKeyToAddresses} from '../crypto/address';
import {Account, deriveLegacySymkey} from './account';
import {KeyEntry, KeystoreManager, KdfParams} from './keystore';
import {decryptFromHex} from '../crypto/aes';

export class KeyManager {
  private keystoreManager: KeystoreManager;
  private keys: KeyEntry[] = [];
  private activeKeyId: string | null = null;
  private currentAccount: Account | null = null;
  private kdfParams: KdfParams | null = null;

  constructor(keystoreManager: KeystoreManager) {
    this.keystoreManager = keystoreManager;
  }

  async loadAccount(account: Account, kdfParams: KdfParams): Promise<void> {
    this.currentAccount = account;
    this.kdfParams = kdfParams;
    const result = await this.keystoreManager.load(account.id, account.symkey);
    this.keys = result ? result.keys : [];
    if (this.keys.length > 0 && !this.activeKeyId) {
      this.activeKeyId = this.keys[0].id;
    }
  }

  // Attach without loading — used when creating a brand-new account.
  attachAccount(account: Account, kdfParams: KdfParams): void {
    this.currentAccount = account;
    this.kdfParams = kdfParams;
    this.keys = [];
    this.activeKeyId = null;
  }

  // Re-encrypt the in-memory keystore under a new symkey + kdf, then persist.
  // Used by the legacy-to-Argon2id migration path at login time.
  async rewrapAndSave(
    newSymkey: Uint8Array,
    newKdfParams: KdfParams,
  ): Promise<void> {
    if (!this.currentAccount) {
      throw new Error('No account loaded');
    }
    const oldSymkey = this.currentAccount.symkey;
    this.currentAccount = {...this.currentAccount, symkey: newSymkey};
    this.kdfParams = newKdfParams;
    await this.saveKeys();
    oldSymkey.fill(0);
  }

  async saveKeys(): Promise<void> {
    if (!this.currentAccount || !this.kdfParams) {
      throw new Error('No account loaded');
    }
    await this.keystoreManager.save(
      this.currentAccount.id,
      this.keys,
      this.currentAccount.symkey,
      this.kdfParams,
    );
  }

  // `backedUp` is false only for keys this app generated — the user has never
  // seen that material anywhere else. Imported keys came from a copy the user
  // already holds, so they start out backed up.
  private createKeyEntry(
    privateKey: Uint8Array,
    compressed: boolean = true,
    backedUp: boolean = true,
  ): KeyEntry {
    const pubKey = getPublicKey(privateKey, compressed);
    const addresses = privateKeyToAddresses(privateKey);
    return {
      id: addresses[CoinType.FCH],
      privateKey,
      publicKey: pubKey,
      isWatchOnly: false,
      addresses,
      backedUp,
    };
  }

  async addRandomKey(): Promise<KeyEntry> {
    const privKey = generateRandomPrivateKey();
    const entry = this.createKeyEntry(privKey, true, false);
    this.keys.push(entry);
    if (!this.activeKeyId) {
      this.activeKeyId = entry.id;
    }
    await this.saveKeys();
    return entry;
  }

  async importKeyHex(hex: string): Promise<KeyEntry> {
    const privKey = privateKeyFromHex(hex);
    const entry = this.createKeyEntry(privKey);
    this.checkDuplicate(entry.id);
    this.keys.push(entry);
    await this.saveKeys();
    return entry;
  }

  async importKeyWIF(wif: string): Promise<KeyEntry> {
    const {key, compressed} = privateKeyFromWIF(wif);
    const entry = this.createKeyEntry(key, compressed);
    this.checkDuplicate(entry.id);
    this.keys.push(entry);
    await this.saveKeys();
    return entry;
  }

  async importKeyFromSecret(secret: string): Promise<KeyEntry> {
    const privKey = privateKeyFromSecret(secret);
    const entry = this.createKeyEntry(privKey);
    this.checkDuplicate(entry.id);
    this.keys.push(entry);
    await this.saveKeys();
    return entry;
  }

  async importPublicKey(pubKeyHex: string): Promise<KeyEntry> {
    const pubKey = publicKeyFromHex(pubKeyHex);
    const addresses = publicKeyToAddresses(pubKey);
    const entry: KeyEntry = {
      id: addresses[CoinType.FCH],
      privateKey: null,
      publicKey: pubKey,
      isWatchOnly: true,
      addresses,
      backedUp: true, // nothing to back up without a prikey
    };
    this.checkDuplicate(entry.id);
    this.keys.push(entry);
    await this.saveKeys();
    return entry;
  }

  async importKeyCipher(cipherJson: string, password: string): Promise<KeyEntry> {
    let parsed: any;
    try {
      parsed = JSON.parse(cipherJson);
    } catch {
      throw new Error('Invalid JSON format');
    }
    if (!parsed.iv || !parsed.cipher) {
      throw new Error('Invalid cipher: missing iv or cipher');
    }
    const encKey = deriveLegacySymkey(password);
    // Decode Base64 cipher to hex for decryptFromHex
    const binary = atob(parsed.cipher);
    const cipherBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      cipherBytes[i] = binary.charCodeAt(i);
    }
    let ciphertextHex = '';
    for (let i = 0; i < cipherBytes.length; i++) {
      ciphertextHex += cipherBytes[i].toString(16).padStart(2, '0');
    }
    let privKeyBytes: Uint8Array;
    try {
      privKeyBytes = decryptFromHex(parsed.iv, ciphertextHex, encKey);
    } catch {
      throw new Error('Decryption failed — wrong password or corrupted cipher');
    }
    if (privKeyBytes.length !== 32) {
      throw new Error('Decrypted key has invalid length');
    }
    const entry = this.createKeyEntry(privKeyBytes);
    this.checkDuplicate(entry.id);
    this.keys.push(entry);
    await this.saveKeys();
    return entry;
  }

  async markBackedUp(fchAddress: string): Promise<void> {
    const key = this.keys.find(k => k.id === fchAddress);
    if (!key || key.backedUp) return;
    key.backedUp = true;
    await this.saveKeys();
  }

  async removeKey(fchAddress: string): Promise<void> {
    const index = this.keys.findIndex(k => k.id === fchAddress);
    if (index === -1) {
      throw new Error(`Key not found: ${fchAddress}`);
    }
    this.keys.splice(index, 1);
    if (this.activeKeyId === fchAddress) {
      this.activeKeyId = this.keys.length > 0 ? this.keys[0].id : null;
    }
    await this.saveKeys();
  }

  listKeys(): KeyEntry[] {
    return [...this.keys];
  }

  getActiveKey(): KeyEntry | null {
    if (!this.activeKeyId) {
      return null;
    }
    return this.keys.find(k => k.id === this.activeKeyId) || null;
  }

  setActiveKey(fchAddress: string): void {
    const key = this.keys.find(k => k.id === fchAddress);
    if (!key) {
      throw new Error(`Key not found: ${fchAddress}`);
    }
    this.activeKeyId = fchAddress;
  }

  clear(): void {
    // Wipe prikeys from memory
    for (const key of this.keys) {
      if (key.privateKey) {
        key.privateKey.fill(0);
      }
    }
    this.keys = [];
    this.activeKeyId = null;
    this.currentAccount = null;
  }

  private checkDuplicate(id: string): void {
    if (this.keys.some(k => k.id === id)) {
      throw new Error(`Key already exists: ${id}`);
    }
  }
}
