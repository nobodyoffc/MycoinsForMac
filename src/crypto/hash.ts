import {sha256 as _sha256} from '@noble/hashes/sha2.js';
import {ripemd160 as _ripemd160} from '@noble/hashes/legacy.js';
import {keccak_256} from '@noble/hashes/sha3.js';

export function sha256(data: Uint8Array): Uint8Array {
  return _sha256(data);
}

export function doubleSha256(data: Uint8Array): Uint8Array {
  return _sha256(_sha256(data));
}

export function ripemd160(data: Uint8Array): Uint8Array {
  return _ripemd160(data);
}

export function hash160(data: Uint8Array): Uint8Array {
  return _ripemd160(_sha256(data));
}

export function keccak256(data: Uint8Array): Uint8Array {
  return keccak_256(data);
}
