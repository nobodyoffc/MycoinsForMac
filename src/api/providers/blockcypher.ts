/**
 * BlockCypher API provider for BTC, DOGE.
 * Free tier: 200 requests/hour, no API key needed.
 * Docs: https://www.blockcypher.com/dev/bitcoin/
 */

import {CoinAPI, APIConfig} from '../types';
import {CoinType, UTXO, Transaction} from '../../coins/types';
import {fetchWithTimeout} from '../http';

const CHAIN_MAP: Partial<Record<CoinType, string>> = {
  [CoinType.BTC]: 'btc/main',
  [CoinType.DOGE]: 'doge/main',
};

export class BlockCypherAPI implements CoinAPI {
  private coin: CoinType;
  private chain: string;
  private baseUrl: string;
  private token?: string;
  private timeout: number;

  constructor(coin: CoinType, config?: Partial<APIConfig>) {
    this.coin = coin;
    this.chain = CHAIN_MAP[coin] || 'btc/main';
    this.baseUrl = config?.baseUrl || 'https://api.blockcypher.com/v1';
    this.token = config?.apiKey || undefined;
    this.timeout = config?.timeout || 15000;
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
    const resp = await fetchWithTimeout(url, {}, this.timeout);
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
    const resp = await fetchWithTimeout(
      this.withToken(`${this.baseUrl}/${this.chain}/txs/push`),
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({tx: rawHex}),
      },
      this.timeout,
    );
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
    // Merge confirmed (txrefs) and unconfirmed (unconfirmed_txrefs) refs; an
    // address whose only activity is still in the mempool has no `txrefs`.
    const allRefs: any[] = [
      ...(json.unconfirmed_txrefs || []),
      ...(json.txrefs || []),
    ];
    // A tx_hash can appear twice (once as input, once as output of the same
    // tx); keep the first ref seen per txid so each tx shows once.
    const seen = new Set<string>();
    const uniqueRefs = allRefs.filter((ref: any) => {
      if (seen.has(ref.tx_hash)) return false;
      seen.add(ref.tx_hash);
      return true;
    });
    return uniqueRefs.map((ref: any) => ({
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
