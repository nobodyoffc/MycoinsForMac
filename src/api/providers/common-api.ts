/**
 * Unified API provider using the common endpoint interface.
 *
 * All requests use encrypted POST (AsyTwoWay).
 * Responses are also encrypted (AsyTwoWay) — client must decrypt.
 *
 * Endpoints:
 *   POST /mycoins/v1/getBalance   {"coin":"FCH","address":"Fxxx"}
 *   POST /mycoins/v1/getUtxos     {"coin":"FCH","address":"Fxxx"}
 *   POST /mycoins/v1/broadcast    {"coin":"FCH","rawTx":"0200..."}
 *   POST /mycoins/v1/getTxHistory  {"coin":"FCH","address":"Fxxx"}
 */

import {CoinAPI} from '../types';
import {CoinType, UTXO, Transaction} from '../../coins/types';
import {
  encryptAsyTwoWay,
  decryptAsyTwoWay,
  EncryptedEnvelope,
} from '../../crypto/ecdh-encryption';
import {hexToBytes, utf8ToBytes, bytesToHex} from '../../crypto/encoding';

export interface FCHServiceInfo {
  dealer: string;
  dealerPubkey: string;
  minPayment: string; // in FCH (e.g. "0.0001")
  pricePerKB: string;
  currency: string;
}

export interface ApiBalanceOutEvent {
  code: number;
  dealer: string;
  minPayment: string; // in FCH
  utxos: UTXO[] | null; // UTXOs provided for auto-pay, or null if manual
}

// Global callback for 1004 events — set by the UI layer
let onApiBalanceOut: ((event: ApiBalanceOutEvent) => void) | null = null;

export function setOnApiBalanceOut(callback: ((event: ApiBalanceOutEvent) => void) | null) {
  onApiBalanceOut = callback;
}

export class CommonAPI implements CoinAPI {
  private baseUrl: string;
  private coin: CoinType;
  private clientPrivateKey: Uint8Array | null = null;
  private serverPubkey: Uint8Array | null = null;
  private serviceInfo: FCHServiceInfo | null = null;

  constructor(baseUrl: string, coin: CoinType) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.coin = coin;
  }

  // Exposed for ApiPaymentHandler's direct broadcast call (bypasses the
  // common-API wrapper because it's the very path that returned 1004).
  getBaseUrl(): string {
    return this.baseUrl;
  }

  setKeys(clientPrivateKeyHex: string, serverPubkeyHex: string) {
    this.clientPrivateKey = hexToBytes(clientPrivateKeyHex);
    this.serverPubkey = hexToBytes(serverPubkeyHex);
  }

  getServiceInfo(): FCHServiceInfo | null {
    return this.serviceInfo;
  }

  getClientPrivateKey(): Uint8Array | null {
    return this.clientPrivateKey;
  }

  /**
   * Send an encrypted POST request to a common API endpoint.
   */
  private async encryptedPost(endpoint: string, params: Record<string, string>): Promise<any> {
    if (!this.clientPrivateKey || !this.serverPubkey) {
      throw new Error(`[CommonAPI] FCH API not ready (server may be offline)`);
    }

    console.log(`[CommonAPI] POST ${endpoint}`, JSON.stringify(params));

    const plaintext = utf8ToBytes(JSON.stringify(params));
    const envelope = encryptAsyTwoWay(plaintext, this.clientPrivateKey, this.serverPubkey);

    const url = `${this.baseUrl}/mycoins/v1/${endpoint}`;
    console.log(`[CommonAPI] Fetching ${url}`);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(envelope),
    });

    const respText = await resp.text();
    console.log(`[CommonAPI] Response status=${resp.status}, length=${respText.length}`);

    // Try to decrypt the response
    let respData: any;
    try {
      const respEnvelope: EncryptedEnvelope = JSON.parse(respText);
      if (respEnvelope.type === 'AsyTwoWay' && respEnvelope.cipher) {
        const decryptedBytes = decryptAsyTwoWay(respEnvelope, this.clientPrivateKey);
        const decryptedStr = String.fromCharCode(...decryptedBytes);
        console.log(`[CommonAPI] Decrypted: ${decryptedStr.substring(0, 200)}`);
        respData = JSON.parse(decryptedStr);
      } else {
        respData = respEnvelope;
      }
    } catch (decryptErr: any) {
      console.warn(`[CommonAPI] Decrypt failed: ${decryptErr.message}, trying plain JSON`);
      try {
        respData = JSON.parse(respText);
      } catch {
        throw new Error(`[CommonAPI] Invalid response from ${endpoint}: ${respText.substring(0, 100)}`);
      }
    }

    // Handle error code 1004: API balance out
    if (respData.code === 1004) {
      this.handleApiBalanceOut(respData);
      throw new Error('API balance exhausted. Please top up to continue using the service.');
    }

    if (respData.code !== 0) {
      throw new Error(`[CommonAPI] ${endpoint} error [${respData.code}]: ${respData.message}`);
    }

    console.log(`[CommonAPI] ${endpoint} success`);
    return respData.data;
  }

  /**
   * Handle code 1004: API balance out.
   * If response includes UTXO data, trigger auto-pay dialog.
   * Otherwise, notify user to pay manually.
   */
  private handleApiBalanceOut(respData: any) {
    let service = this.serviceInfo;
    if (!service) {
      console.warn('[CommonAPI] 1004 but no service info cached, fetching...');
      // Fetch service info in background (getService is free)
      fetch(`${this.baseUrl}/mycoins/v1/getService`)
        .then(r => r.json())
        .then(json => {
          const s = typeof json.data === 'string' ? JSON.parse(json.data) : json.data;
          if (s?.dealer) {
            this.serviceInfo = {
              dealer: s.dealer,
              dealerPubkey: s.dealerPubkey || '',
              minPayment: s.minPayment || '0.0001',
              pricePerKB: s.pricePerKB || '0.00000001',
              currency: s.currency || 'fch',
            };
            this.handleApiBalanceOut(respData); // retry with service info
          }
        })
        .catch(() => {});
      return;
    }

    let utxos: UTXO[] | null = null;

    // Check if data is a list of Cash/UTXOs
    if (Array.isArray(respData.data) && respData.data.length > 0) {
      const firstItem = respData.data[0];
      // Check if it looks like a Cash object (has birthTxId + value)
      if (firstItem.birthTxId && firstItem.value !== undefined) {
        utxos = respData.data.map((cash: any) => ({
          txid: cash.birthTxId,
          vout: cash.birthIndex ?? 0,
          value: cash.value,
          scriptPubKey: cash.lockScript || '',
        }));
      }
      // Also accept our common UTXO format (has txid + value)
      else if (firstItem.txid && firstItem.value !== undefined) {
        utxos = respData.data.map((u: any) => ({
          txid: u.txid,
          vout: u.vout ?? 0,
          value: u.value,
          scriptPubKey: u.script || u.lockScript || '',
        }));
      }
    }

    console.log(`[CommonAPI] Code 1004: dealer=${service.dealer}, minPayment=${service.minPayment}, utxos=${utxos ? utxos.length : 'none'}`);

    const event: ApiBalanceOutEvent = {
      code: 1004,
      dealer: service.dealer,
      minPayment: service.minPayment,
      utxos,
    };

    if (onApiBalanceOut) {
      onApiBalanceOut(event);
    }
  }

  /**
   * Initialize by fetching the server's pubkey from getService.
   */
  async init(clientPrivateKeyHex: string): Promise<void> {
    this.clientPrivateKey = hexToBytes(clientPrivateKeyHex);

    const url = `${this.baseUrl}/mycoins/v1/getService`;
    console.log(`[CommonAPI] init: fetching ${url}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let resp;
    try {
      resp = await fetch(url, {signal: controller.signal});
    } finally {
      clearTimeout(timeout);
    }
    const json = await resp.json();
    const service = typeof json.data === 'string' ? JSON.parse(json.data) : json.data;
    if (service?.dealerPubkey) {
      this.serverPubkey = hexToBytes(service.dealerPubkey);
      this.serviceInfo = {
        dealer: service.dealer || '',
        dealerPubkey: service.dealerPubkey,
        minPayment: service.minPayment || '0.0001',
        pricePerKB: service.pricePerKB || '0.00000001',
        currency: service.currency || 'fch',
      };
      console.log(`[CommonAPI] init: dealer=${this.serviceInfo.dealer}, minPayment=${this.serviceInfo.minPayment}`);
    } else {
      console.error(`[CommonAPI] init: no dealerPubkey in response`);
      throw new Error('Failed to get server pubkey from getService');
    }
  }

  // ---- CoinAPI interface ----

  async getBalance(address: string): Promise<string> {
    const data = await this.encryptedPost('getBalance', {
      coin: this.coin,
      address,
    });
    return String(data.balance ?? 0);
  }

  async getUTXOs(address: string): Promise<UTXO[]> {
    const data = await this.encryptedPost('getUtxos', {
      coin: this.coin,
      address,
    });
    if (!Array.isArray(data)) {
      return [];
    }
    return data.map((u: any) => ({
      txid: u.txid,
      vout: u.vout,
      value: u.value,
      scriptPubKey: u.script || '',
    }));
  }

  async broadcastTransaction(rawHex: string): Promise<string> {
    const data = await this.encryptedPost('broadcast', {
      coin: this.coin,
      rawTx: rawHex,
    });
    return data.txid || data;
  }

  async getTransactionHistory(address: string): Promise<Transaction[]> {
    const data = await this.encryptedPost('getTxHistory', {
      coin: this.coin,
      address,
    });
    if (!Array.isArray(data)) {
      return [];
    }
    return data.map((tx: any) => ({
      txid: tx.txid,
      coin: this.coin,
      from: '',
      to: address,
      amount: String(tx.value || 0),
      fee: '0',
      timestamp: tx.time || 0,
      confirmations: tx.confirmations || 0,
      direction: (tx.direction || 'in') as 'in' | 'out',
    }));
  }
}
