/**
 * AsyTwoWay encryption for FCH API (EccK1AesGcm256@No1_NrC7)
 *
 * Pipeline:
 * 1. ECDH(clientPrikey, serverPubkey) → Z (32-byte shared secret, x-coordinate)
 * 2. HKDF-SHA512(ikm=Z, salt=nonce, info="hkdf", L=32) → symkey
 * 3. AES-GCM-256(key=symkey, iv=nonce, plaintext) → ciphertext+tag
 */

import * as secp from '@noble/secp256k1';
import {sha512} from '@noble/hashes/sha2.js';
import {hmac} from '@noble/hashes/hmac.js';
import {gcm} from '@noble/ciphers/aes.js';
import {bytesToHex, hexToBytes, utf8ToBytes} from './encoding';

// --- ECDH ---

export function ecdhSharedSecret(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
): Uint8Array {
  const sharedPoint = secp.getSharedSecret(privateKey, publicKey, true);
  // Return just the x-coordinate (32 bytes, skip the 0x02/0x03 prefix)
  return sharedPoint.slice(1);
}

// --- HKDF-SHA512 (RFC 5869) ---

function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha512, key, data);
}

export function hkdfExtract(
  salt: Uint8Array | null,
  ikm: Uint8Array,
): Uint8Array {
  const effectiveSalt =
    salt && salt.length > 0 ? salt : new Uint8Array(64); // 64 zero bytes
  return hmacSha512(effectiveSalt, ikm);
}

export function hkdfExpand(
  prk: Uint8Array,
  info: Uint8Array | null,
  length: number,
): Uint8Array {
  if (length < 1 || length > 255 * 64) {
    throw new Error('HKDF expand: invalid length');
  }
  const n = Math.ceil(length / 64);
  const okm = new Uint8Array(length);
  let previousT = new Uint8Array(0);
  let copied = 0;

  for (let i = 1; i <= n; i++) {
    // buf = previousT || info || byte(i)
    const parts: Uint8Array[] = [previousT];
    if (info && info.length > 0) {
      parts.push(info);
    }
    parts.push(new Uint8Array([i]));

    const totalLen = parts.reduce((acc, p) => acc + p.length, 0);
    const buf = new Uint8Array(totalLen);
    let offset = 0;
    for (const part of parts) {
      buf.set(part, offset);
      offset += part.length;
    }

    const t = hmacSha512(prk, buf);
    const toCopy = Math.min(64, length - copied);
    okm.set(t.slice(0, toCopy), copied);
    copied += toCopy;
    previousT = new Uint8Array(t);
  }

  return okm;
}

export function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array | null,
  info: Uint8Array | null,
  length: number,
): Uint8Array {
  const prk = hkdfExtract(salt, ikm);
  return hkdfExpand(prk, info, length);
}

// --- AES-GCM-256 ---

function aesGcmEncrypt(
  key: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array,
): Uint8Array {
  const cipher = gcm(key, iv);
  return cipher.encrypt(plaintext);
}

function aesGcmDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Uint8Array {
  const cipher = gcm(key, iv);
  return cipher.decrypt(ciphertext);
}

// --- Full AsyTwoWay Pipeline ---

const HKDF_INFO = utf8ToBytes('hkdf');

export function deriveSymKey(
  sharedSecret: Uint8Array,
  nonce: Uint8Array,
): Uint8Array {
  return hkdf(sharedSecret, nonce, HKDF_INFO, 32);
}

export interface EncryptedEnvelope {
  type: string;
  alg: string;
  cipher: string; // Base64
  iv: string; // hex
  pubkeyA: string; // hex, 33 bytes compressed
}

export function encryptAsyTwoWay(
  plaintext: Uint8Array,
  clientPrivateKey: Uint8Array,
  serverPublicKey: Uint8Array,
  nonce?: Uint8Array,
): EncryptedEnvelope {
  // Generate random 12-byte nonce if not provided
  if (!nonce) {
    nonce = new Uint8Array(12);
    crypto.getRandomValues(nonce);
  }

  // 1. ECDH shared secret
  const z = ecdhSharedSecret(clientPrivateKey, serverPublicKey);

  // 2. HKDF derive symmetric key
  const symkey = deriveSymKey(z, nonce);

  // 3. AES-GCM encrypt
  const cipherBytes = aesGcmEncrypt(symkey, nonce, plaintext);

  // 4. Build envelope
  const clientPubKey = secp.getPublicKey(clientPrivateKey, true);

  return {
    type: 'AsyTwoWay',
    alg: 'EccK1AesGcm256@No1_NrC7',
    cipher: uint8ToBase64(cipherBytes),
    iv: bytesToHex(nonce),
    pubkeyA: bytesToHex(clientPubKey),
  };
}

export function decryptAsyTwoWay(
  envelope: EncryptedEnvelope,
  receiverPrivateKey: Uint8Array,
): Uint8Array {
  const nonce = hexToBytes(envelope.iv);
  const senderPublicKey = hexToBytes(envelope.pubkeyA);
  const cipherBytes = base64ToUint8(envelope.cipher);

  // 1. ECDH shared secret
  const z = ecdhSharedSecret(receiverPrivateKey, senderPublicKey);

  // 2. HKDF derive symmetric key
  const symkey = deriveSymKey(z, nonce);

  // 3. AES-GCM decrypt
  return aesGcmDecrypt(symkey, nonce, cipherBytes);
}

// --- Base64 helpers ---

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// --- Request Body Builder ---

export interface RequestBody {
  time: number;
  nonce: number;
  via?: string;
  fcdsl: any;
}

export function buildEncryptedRequest(
  requestBody: RequestBody,
  clientPrivateKey: Uint8Array,
  serverPublicKey: Uint8Array,
): EncryptedEnvelope {
  const plaintext = utf8ToBytes(JSON.stringify(requestBody));
  return encryptAsyTwoWay(plaintext, clientPrivateKey, serverPublicKey);
}
