import {argon2id} from 'hash-wasm';
import {sha256} from '../crypto/hash';
import {utf8ToBytes, bytesToHex, hexToBytes} from '../crypto/encoding';

export interface Account {
  id: string; // 12-char hex (first 6 bytes of sha256(sha256(password)))
  symkey: Uint8Array; // 32 bytes: Argon2id output (or legacy sha256(password) during migration)
}

export const ARGON2ID_PARAMS = {
  memoryKiB: 64 * 1024, // 64 MiB
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
  saltLength: 16,
} as const;

export function deriveAccountId(password: string): string {
  const firstHash = sha256(utf8ToBytes(password));
  const secondHash = sha256(firstHash);
  return bytesToHex(secondHash.slice(0, 6));
}

export function deriveLegacySymkey(password: string): Uint8Array {
  return sha256(utf8ToBytes(password));
}

export async function deriveArgon2idSymkey(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const hex = await argon2id({
    password,
    salt,
    parallelism: ARGON2ID_PARAMS.parallelism,
    iterations: ARGON2ID_PARAMS.iterations,
    memorySize: ARGON2ID_PARAMS.memoryKiB,
    hashLength: ARGON2ID_PARAMS.hashLength,
    outputType: 'hex',
  });
  return hexToBytes(hex);
}

export function generateSalt(): Uint8Array {
  const salt = new Uint8Array(ARGON2ID_PARAMS.saltLength);
  crypto.getRandomValues(salt);
  return salt;
}

export function verifyPassword(password: string, accountId: string): boolean {
  return deriveAccountId(password) === accountId;
}
