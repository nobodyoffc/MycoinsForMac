/**
 * BlockCypher API provider for BTC, DOGE.
 * Free tier: 200 requests/hour, no API key needed.
 * Docs: https://www.blockcypher.com/dev/bitcoin/
 */

import {CoinAPI, APIConfig} from '../types';
import {CoinType, UTXO, Transaction} from '../../coins/types';

const CHAIN_MAP: Partial<Record<CoinType, string>> = {
  [CoinType.BTC]: 'btc/main',
  [CoinType.DOGE]: 'doge/main',
};

export class BlockCypherAPI implements CoinAPI {
  private coin: CoinType;
  private chain: string;
  private baseUrl: string;
  private token?: string;

  constructor(coin: CoinType, config?: Partial<APIConfig>) {
    this.coin = coin;
    this.chain = CHAIN_MAP[coin] || 'btc/main';
    this.baseUrl = config?.baseUrl || 'https://api.blockcypher.com/v1';
    this.token = config?.apiKey || undefined;
  }

  // Append the BlockCypher API token, if configured, to raise the request
  // limit above the anonymous 200/hour cap (anonymous 429s also drop their
  // CORS headers, which the webview reports as a CORS error).
  private withToken(url: string): string {
    if (!this.token) return url;
    return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(this.token)}`;
  }

  private async fetchJson(path: string): Promise<any> {
    const url = this.withToken(`${this.baseUrl}/${this.chain}${path}`);
    const resp = await fetch(url);
    if (!resp.ok) {
      if (resp.status === 429) {
        throw new Error(
          'BlockCypher rate limit reached (429). Add a BlockCypher API token in Settings to raise the limit.',
        );
      }
      throw new Error(`BlockCypher error: ${resp.status} ${resp.statusText}`);
    }
    return resp.json();
  }

  async getBalance(address: string): Promise<string> {
    const json = await this.fetchJson(`/addrs/${address}/balance`);
    // final_balance includes unconfirmed, so change outputs are counted
    return String(json.final_balance ?? json.balance ?? 0);
  }

  async getUTXOs(address: string): Promise<UTXO[]> {
    const json = await this.fetchJson(
      `/addrs/${address}?unspentOnly=true&includeScript=true&limit=50`,
    );
    // Merge confirmed (txrefs) and unconfirmed (unconfirmed_txrefs) UTXOs
    const allRefs: any[] = [
      ...(json.txrefs || []),
      ...(json.unconfirmed_txrefs || []),
    ];
    if (allRefs.length === 0) {
      return [];
    }
    return allRefs
      .filter((ref: any) => ref.spent === false || ref.spent === undefined)
      .filter((ref: any) => ref.tx_output_n >= 0) // exclude inputs (tx_output_n = -1 means input)
      .map((ref: any) => ({
        txid: ref.tx_hash,
        vout: ref.tx_output_n,
        value: ref.value,
        scriptPubKey: ref.script || '',
      }));
  }

  async broadcastTransaction(rawHex: string): Promise<string> {
    const resp = await fetch(this.withToken(`${this.baseUrl}/${this.chain}/txs/push`), {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({tx: rawHex}),
    });
    const json = await resp.json();
    if (json.tx?.hash) {
      return json.tx.hash;
    }
    throw new Error(
      `Broadcast failed: ${json.error || JSON.stringify(json)}`,
    );
  }

  async getTransactionHistory(
    address: string,
    page: number = 0,
  ): Promise<Transaction[]> {
    const json = await this.fetchJson(`/addrs/${address}?limit=20`);
    if (!json.txrefs) {
      return [];
    }
    return json.txrefs.map((ref: any) => ({
      txid: ref.tx_hash,
      coin: this.coin,
      from: '',
      to: '',
      amount: String(Math.abs(ref.value || 0)),
      fee: '0',
      timestamp: ref.confirmed
        ? Math.floor(new Date(ref.confirmed).getTime() / 1000)
        : 0,
      confirmations: ref.confirmations || 0,
      direction: ref.tx_input_n < 0 ? ('in' as const) : ('out' as const),
    }));
  }

  async estimateFee(): Promise<{low: number; medium: number; high: number}> {
    return {low: 1, medium: 10, high: 50};
  }
}
