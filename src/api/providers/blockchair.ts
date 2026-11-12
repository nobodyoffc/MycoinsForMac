import {CoinAPI, APIConfig} from '../types';
import {CoinType, UTXO, Transaction, FeeEstimate} from '../../coins/types';
import {fetchWithTimeout} from '../http';

/**
 * Blockchair API provider for BTC, BCH, DOGE.
 * Free tier: 30 requests/minute, no API key needed.
 * Docs: https://blockchair.com/api/docs
 */

const CHAIN_MAP: Partial<Record<CoinType, string>> = {
  [CoinType.BTC]: 'bitcoin',
  [CoinType.BCH]: 'bitcoin-cash',
  [CoinType.DOGE]: 'dogecoin',
};

export class BlockchairAPI implements CoinAPI {
  private config: APIConfig;
  private coin: CoinType;
  private chain: string;

  constructor(coin: CoinType, config?: Partial<APIConfig>) {
    this.coin = coin;
    this.chain = CHAIN_MAP[coin] || 'bitcoin';
    this.config = {
      baseUrl: config?.baseUrl || 'https://api.blockchair.com',
      apiKey: config?.apiKey,
      timeout: config?.timeout || 15000,
    };
  }

  private get baseUrl(): string {
    return this.config.baseUrl.replace(/\/$/, '');
  }

  private async fetchJson(path: string): Promise<any> {
    let url = `${this.baseUrl}/${this.chain}${path}`;
    if (this.config.apiKey) {
      url += (url.includes('?') ? '&' : '?') + `key=${this.config.apiKey}`;
    }
    const resp = await fetchWithTimeout(url, {}, this.config.timeout);
    if (!resp.ok) {
      throw new Error(`Blockchair API error: ${resp.status} ${resp.statusText}`);
    }
    return resp.json();
  }

  async getBalance(address: string): Promise<string> {
    const json = await this.fetchJson(
      `/dashboards/address/${address}?limit=0`,
    );
    const data = json.data?.[address];
    if (!data) {
      return '0';
    }
    // Blockchair only returns confirmed balance
    return String(data.address?.balance ?? 0);
  }

  async getUTXOs(address: string): Promise<UTXO[]> {
    const json = await this.fetchJson(
      `/dashboards/address/${address}?limit=100`,
    );
    const data = json.data?.[address];
    if (!data?.utxo) {
      return [];
    }
    // Note: Blockchair only returns confirmed UTXOs.
    // After sending, change output won't appear until confirmed (~10 min for BCH).
    return data.utxo.map((u: any) => ({
      txid: u.transaction_hash,
      vout: u.index,
      value: u.value,
      scriptPubKey: '', // Blockchair doesn't return scriptPubKey directly
    }));
  }

  async broadcastTransaction(rawHex: string): Promise<string> {
    const resp = await fetchWithTimeout(
      `${this.baseUrl}/${this.chain}/push/transaction`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({data: rawHex}),
      },
      this.config.timeout,
    );
    const json = await resp.json();
    if (json.data?.transaction_hash) {
      return json.data.transaction_hash;
    }
    throw new Error(
      `Broadcast failed: ${json.context?.error || JSON.stringify(json)}`,
    );
  }

  async getTransactionHistory(
    address: string,
    page: number = 0,
  ): Promise<Transaction[]> {
    const offset = page * 20;
    const json = await this.fetchJson(
      `/dashboards/address/${address}?limit=20&offset=${offset}&transaction_details=true`,
    );
    const data = json.data?.[address];
    if (!data?.transactions) {
      return [];
    }
    return data.transactions.map((tx: any) => ({
      txid: tx.hash || tx,
      coin: this.coin,
      from: '',
      to: '',
      amount: String(tx.balance_change ? Math.abs(tx.balance_change) : 0),
      fee: '0',
      timestamp: 0,
      confirmations: 0,
      direction: tx.balance_change >= 0 ? ('in' as const) : ('out' as const),
    }));
  }

  async estimateFee(): Promise<FeeEstimate> {
    const json = await this.fetchJson('/stats');
    const stats = json.data;
    const suggested = stats?.suggested_transaction_fee_per_byte_sat || 10;
    return {
      low: Math.max(1, Math.floor(suggested * 0.5)),
      medium: suggested,
      high: Math.ceil(suggested * 2),
    };
  }
}
