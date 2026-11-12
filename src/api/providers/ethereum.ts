import {CoinAPI, APIConfig} from '../types';
import {CoinType, Transaction, GasEstimate} from '../../coins/types';
import {fetchWithTimeout} from '../http';

/**
 * Ethereum JSON-RPC + Etherscan API provider for ETH, USDT, USDC.
 * Uses public RPC for balance/nonce/gas/broadcast.
 * Uses Etherscan for transaction history and ERC-20 balances.
 */

const ERC20_CONTRACTS: Partial<Record<CoinType, string>> = {
  [CoinType.USDT]: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  [CoinType.USDC]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
};

// ERC-20 balanceOf(address) selector
const BALANCE_OF_SELECTOR = '0x70a08231';

export class EthereumAPI implements CoinAPI {
  private rpcUrl: string;
  private etherscanUrl: string;
  private etherscanApiKey: string;
  private coin: CoinType;
  private timeout: number;

  constructor(coin: CoinType, config?: Partial<APIConfig>) {
    this.coin = coin;
    this.rpcUrl = config?.baseUrl || 'https://ethereum-rpc.publicnode.com';
    // Etherscan V2 endpoint. The old V1 (`/api`) is deprecated and now rejects
    // every request with "deprecated V1 endpoint". V2 needs a `chainid` (added
    // in etherscanCall) and a valid API key — the keyless tier is gone.
    this.etherscanUrl = 'https://api.etherscan.io/v2/api';
    this.etherscanApiKey = config?.apiKey || '';
    this.timeout = config?.timeout || 15000;
  }

  // --- JSON-RPC helper ---

  private async rpcCall(method: string, params: any[]): Promise<any> {
    const resp = await fetchWithTimeout(
      this.rpcUrl,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          jsonrpc: '2.0',
          method,
          params,
          id: Date.now(),
        }),
      },
      this.timeout,
    );
    const json = await resp.json();
    if (json.error) {
      throw new Error(`ETH RPC error: ${json.error.message}`);
    }
    return json.result;
  }

  // --- Etherscan helper ---

  private async etherscanCall(params: Record<string, string>): Promise<any> {
    // V2 routes all chains through one host, selected by chainid (1 = mainnet).
    const allParams: Record<string, string> = {chainid: '1', ...params};
    const qs = Object.entries(allParams)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    let url = `${this.etherscanUrl}?${qs}`;
    if (this.etherscanApiKey) {
      url += `&apikey=${this.etherscanApiKey}`;
    }
    const resp = await fetchWithTimeout(url, {}, this.timeout);
    return resp.json();
  }

  // --- CoinAPI implementation ---

  async getBalance(address: string): Promise<string> {
    const contract = ERC20_CONTRACTS[this.coin];

    if (contract) {
      // ERC-20 balanceOf call
      const paddedAddr = '0x' + address.slice(2).padStart(64, '0');
      const data = BALANCE_OF_SELECTOR + paddedAddr.slice(2);
      const result = await this.rpcCall('eth_call', [
        {to: contract, data},
        'latest',
      ]);
      return BigInt(result || '0x0').toString();
    }

    // Native ETH balance
    const result = await this.rpcCall('eth_getBalance', [address, 'latest']);
    return BigInt(result || '0x0').toString();
  }

  async getNonce(address: string): Promise<number> {
    const result = await this.rpcCall('eth_getTransactionCount', [
      address,
      'latest',
    ]);
    return Number(BigInt(result || '0x0'));
  }

  async getGasPrice(): Promise<GasEstimate> {
    const gasPrice = await this.rpcCall('eth_gasPrice', []);
    const gas = BigInt(gasPrice || '0x0');
    return {
      maxFeePerGas: gas * 2n,
      maxPriorityFeePerGas: gas / 10n,
    };
  }

  async broadcastTransaction(rawHex: string): Promise<string> {
    const txHex = rawHex.startsWith('0x') ? rawHex : '0x' + rawHex;
    const result = await this.rpcCall('eth_sendRawTransaction', [txHex]);
    return result;
  }

  async getTransactionHistory(
    address: string,
    page: number = 1,
  ): Promise<Transaction[]> {
    const contract = ERC20_CONTRACTS[this.coin];

    const params: Record<string, string> = {
      module: contract ? 'account' : 'account',
      action: contract ? 'tokentx' : 'txlist',
      address,
      sort: 'desc',
      page: String(page),
      offset: '20',
    };
    if (contract) {
      params.contractaddress = contract;
    }

    const json = await this.etherscanCall(params);
    if (json.status !== '1' || !json.result) {
      // status '0' with a string result is an error (e.g. "Missing/Invalid API
      // Key"); the genuine empty case is "No transactions found". Surface real
      // errors so a misconfigured key isn't mistaken for an empty history.
      const msg = typeof json.result === 'string' ? json.result : json.message;
      if (msg && !/no transactions found/i.test(msg)) {
        throw new Error(`Etherscan: ${msg}`);
      }
      return [];
    }

    return json.result.map((tx: any) => ({
      txid: tx.hash,
      coin: this.coin,
      from: tx.from,
      to: tx.to,
      amount: tx.value,
      fee: String(BigInt(tx.gasUsed || 0) * BigInt(tx.gasPrice || 0)),
      timestamp: Number(tx.timeStamp),
      confirmations: Number(tx.confirmations || 0),
      direction:
        tx.to?.toLowerCase() === address.toLowerCase()
          ? ('in' as const)
          : ('out' as const),
    }));
  }

  async estimateFee(): Promise<{low: number; medium: number; high: number}> {
    const gas = await this.getGasPrice();
    const medium = Number(gas.maxFeePerGas / BigInt(1e9)); // Gwei
    return {
      low: Math.max(1, Math.floor(medium * 0.5)),
      medium,
      high: Math.ceil(medium * 1.5),
    };
  }
}
