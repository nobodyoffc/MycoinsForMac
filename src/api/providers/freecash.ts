import {CoinAPI, APIConfig, FCHServiceInfo} from '../types';
import {CoinType, UTXO, Transaction} from '../../coins/types';
import {
  buildEncryptedRequest,
  encryptAsyTwoWay,
  decryptAsyTwoWay,
  RequestBody,
  EncryptedEnvelope,
} from '../../crypto/ecdh-encryption';
import {hexToBytes, utf8ToBytes} from '../../crypto/encoding';

export class FreecashAPI implements CoinAPI {
  private config: APIConfig;
  private clientPrivateKey: Uint8Array | null = null;
  private serverPubkey: Uint8Array | null = null;
  private clientFid: string | null = null;

  constructor(config: APIConfig) {
    this.config = config;
  }

  setClientKey(privateKeyHex: string, fid: string) {
    this.clientPrivateKey = hexToBytes(privateKeyHex);
    this.clientFid = fid;
  }

  private get baseUrl(): string {
    return this.config.baseUrl.replace(/\/$/, '');
  }

  // --- HTTP helpers ---

  private assertKeys(): void {
    if (!this.clientPrivateKey || !this.serverPubkey) {
      throw new Error('Encrypted POST requires client key and server pubkey. Call init() first.');
    }
  }

  private decryptResponse(respJson: any): any {
    if (respJson.type === 'AsyTwoWay' && respJson.cipher) {
      const decryptedBytes = decryptAsyTwoWay(respJson, this.clientPrivateKey!);
      return JSON.parse(String.fromCharCode(...decryptedBytes));
    }
    return respJson;
  }

  private checkCode(json: any): any {
    if (json.code === 1011) {
      return {...json, data: []};
    }
    if (json.code !== 0) {
      throw new Error(`FCH API error [${json.code}]: ${json.message}`);
    }
    return json;
  }

  private async fetchGet(endpoint: string, params?: Record<string, string>): Promise<any> {
    let url = `${this.baseUrl}/mycoins/v1/${endpoint}`;
    if (params) {
      const qs = Object.entries(params)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
      url += `?${qs}`;
    }
    const resp = await fetch(url, {
      method: 'GET',
      headers: {'Content-Type': 'application/json'},
    });
    return this.checkCode(await resp.json());
  }

  /** Encrypted POST with FCDSL body (for FcHttpRequestHandler-based servlets) */
  private async fetchPost(endpoint: string, fcdsl: any): Promise<any> {
    this.assertKeys();
    const requestBody: RequestBody = {
      time: Date.now(),
      nonce: Math.floor(Math.random() * 2147483647),
      via: this.clientFid || undefined,
      fcdsl,
    };
    const envelope = buildEncryptedRequest(
      requestBody,
      this.clientPrivateKey!,
      this.serverPubkey!,
    );
    const resp = await fetch(`${this.baseUrl}/mycoins/v1/${endpoint}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(envelope),
    });
    return this.checkCode(this.decryptResponse(await resp.json()));
  }

  /** Encrypted POST with simple JSON params (for CommonApiBase-based servlets) */
  private async fetchSimplePost(endpoint: string, params: Record<string, string>): Promise<any> {
    this.assertKeys();
    const plaintext = utf8ToBytes(JSON.stringify(params));
    const envelope = encryptAsyTwoWay(plaintext, this.clientPrivateKey!, this.serverPubkey!);
    const resp = await fetch(`${this.baseUrl}/mycoins/v1/${endpoint}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(envelope),
    });
    return this.checkCode(this.decryptResponse(await resp.json()));
  }

  // --- Initialization ---

  async init(): Promise<FCHServiceInfo> {
    const json = await this.fetchGet('getService');
    // data may be a JSON string or object
    const service =
      typeof json.data === 'string' ? JSON.parse(json.data) : json.data;
    if (service.dealerPubkey) {
      this.serverPubkey = hexToBytes(service.dealerPubkey);
    }
    return {
      dealer: service.dealer,
      dealerPubkey: service.dealerPubkey,
    };
  }

  // --- CoinAPI implementation ---

  async getBalance(address: string): Promise<string> {
    const json = await this.fetchSimplePost('getBalance', {address, coin: 'FCH'});
    if (!json.data) {
      return '0';
    }
    return String(json.data.balance || 0);
  }

  async getUTXOs(address: string): Promise<UTXO[]> {
    const json = await this.fetchSimplePost('getUtxos', {address, coin: 'FCH'});
    if (!json.data || json.data.length === 0) {
      return [];
    }
    return json.data.map((utxo: any) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      scriptPubKey: utxo.script || '',
    }));
  }

  async broadcastTransaction(rawHex: string): Promise<string> {
    const json = await this.fetchSimplePost('broadcast', {rawTx: rawHex, coin: 'FCH'});
    return json.data.txid;
  }

  async getTransactionHistory(
    address: string,
    _page: number = 0,
  ): Promise<Transaction[]> {
    try {
      const json = await this.fetchSimplePost('getTxHistory', {address, coin: 'FCH'});
      if (!json.data || json.data.length === 0) {
        return [];
      }
      return json.data.map((tx: any) => ({
        txid: tx.txid,
        coin: CoinType.FCH,
        from: '',
        to: address,
        amount: String(tx.value || 0),
        fee: '0',
        timestamp: tx.time || 0,
        confirmations: 0,
        direction: (tx.direction === 'in' ? 'in' : 'out') as 'in' | 'out',
      }));
    } catch {
      return [];
    }
  }

  // --- FCH-specific endpoints (FCDSL POST) ---

  async getBestBlock(): Promise<any> {
    const json = await this.fetchPost('bestBlock', {});
    return json.data;
  }

  async getBlockByHeights(heights: number[]): Promise<any[]> {
    const json = await this.fetchPost('blockByHeights', {
      ids: heights.map(String),
    });
    return json.data || [];
  }

  async getTxByIds(txids: string[]): Promise<any[]> {
    const json = await this.fetchPost('txByIds', {ids: txids});
    return json.data || [];
  }

  async getCashByIds(cashIds: string[]): Promise<any[]> {
    const json = await this.fetchPost('cashByIds', {ids: cashIds});
    return json.data || [];
  }

  async getFreerByIds(fids: string[]): Promise<any[]> {
    const json = await this.fetchPost('freerByIds', {ids: fids});
    return json.data || [];
  }

  async serviceSearch(fcdsl: any): Promise<any[]> {
    const json = await this.fetchPost('serviceSearch', fcdsl);
    return json.data || [];
  }

  async searchSwapServices(tick?: string): Promise<any[]> {
    const fcdsl: any = {
      query: {
        terms: {
          fields: ['type'],
          values: ['SWAP@No1_NrC7'],
        },
      },
      filter: {
        terms: {
          fields: ['owner'],
          values: ['FJYN3D7x4yiLF692WUAe7Vfo2nQpYDNrC7'],
        },
      },
      except: {
        terms: {
          fields: ['active'],
          values: ['false'],
        },
      },
      sort: [
        {field: 'lastHeight', order: 'desc'},
        {field: 'id', order: 'desc'},
      ],
      size: 20,
    };
    if (tick) {
      fcdsl.query.match = {
        fields: ['params.gTick', 'params.mTick'],
        value: tick,
      };
    }
    console.log('[FCH] searchSwapServices fcdsl:', JSON.stringify(fcdsl));
    const result = await this.serviceSearch(fcdsl);
    console.log('[FCH] searchSwapServices result:', JSON.stringify(result).substring(0, 500));
    return result;
  }
}
