import {CoinType} from '../coins/types';
import {CoinAPI, APIConfig} from './types';
import {CommonAPI} from './providers/common-api';
import {FreecashAPI} from './providers/freecash';
import {BlockchairAPI} from './providers/blockchair';
import {BlockCypherAPI} from './providers/blockcypher';
import {EthereumAPI} from './providers/ethereum';

interface ProviderRegistry {
  providers: Map<CoinType, CoinAPI>;
  fchCommonApi: CommonAPI | null;
  fchLegacyApi: FreecashAPI | null;
}

const registry: ProviderRegistry = {
  providers: new Map(),
  fchCommonApi: null,
  fchLegacyApi: null,
};

export function initializeProviders(config?: {
  fchBaseUrl?: string;
  fchClientPrivkeyHex?: string;
  btcBaseUrl?: string;
  btcApiKey?: string;
  dogeBaseUrl?: string;
  dogeApiKey?: string;
  blockchairApiKey?: string;
  ethRpcUrl?: string;
  etherscanApiKey?: string;
}): void {
  const fchBaseUrl = config?.fchBaseUrl || 'http://localhost:8081/APIP';

  // FCH via common API (encrypted request + response)
  const fchCommonApi = new CommonAPI(fchBaseUrl, CoinType.FCH);
  registry.fchCommonApi = fchCommonApi;

  // Also keep legacy API for getService and FCH-specific endpoints
  const fchLegacyApi = new FreecashAPI({baseUrl: fchBaseUrl});
  registry.fchLegacyApi = fchLegacyApi;

  // Initialize: fetch server pubkey, then set up common API keys
  fchLegacyApi.init().then(info => {
    if (info.dealerPubkey && config?.fchClientPrivkeyHex) {
      fchCommonApi.setKeys(config.fchClientPrivkeyHex, info.dealerPubkey);
    }
  }).catch(() => {
    // Silently fail — keys can be set later
  });

  // Use common API for FCH (falls back to legacy GET if keys not set)
  registry.providers.set(CoinType.FCH, fchCommonApi);

  // BTC, DOGE via BlockCypher (free, no key needed)
  registry.providers.set(
    CoinType.BTC,
    new BlockCypherAPI(CoinType.BTC, {baseUrl: config?.btcBaseUrl, apiKey: config?.btcApiKey}),
  );
  registry.providers.set(
    CoinType.DOGE,
    new BlockCypherAPI(CoinType.DOGE, {baseUrl: config?.dogeBaseUrl, apiKey: config?.dogeApiKey}),
  );

  // BCH via Blockchair
  registry.providers.set(
    CoinType.BCH,
    new BlockchairAPI(CoinType.BCH, {apiKey: config?.blockchairApiKey}),
  );

  // ETH, USDT, USDC via Ethereum RPC + Etherscan
  const ethConfig: Partial<APIConfig> = {
    baseUrl: config?.ethRpcUrl,
    apiKey: config?.etherscanApiKey,
  };
  registry.providers.set(CoinType.ETH, new EthereumAPI(CoinType.ETH, ethConfig));
  registry.providers.set(CoinType.USDT, new EthereumAPI(CoinType.USDT, ethConfig));
  registry.providers.set(CoinType.USDC, new EthereumAPI(CoinType.USDC, ethConfig));
}

export function getProvider(coin: CoinType): CoinAPI {
  const provider = registry.providers.get(coin);
  if (!provider) {
    throw new Error(`No API provider configured for ${coin}`);
  }
  return provider;
}

export function getFCHCommonApi(): CommonAPI {
  if (!registry.fchCommonApi) {
    throw new Error('FCH Common API not initialized.');
  }
  return registry.fchCommonApi;
}

export function getFCHLegacyApi(): FreecashAPI {
  if (!registry.fchLegacyApi) {
    throw new Error('FCH Legacy API not initialized.');
  }
  return registry.fchLegacyApi;
}

/**
 * Rebuild the FCH providers against a new base URL and re-establish keys.
 * Used when the user changes the FCH endpoint in Settings — the existing
 * CommonAPI/FreecashAPI instances hold their base URL immutably, so they must
 * be replaced rather than mutated. Consumers fetch the provider fresh via
 * getProvider/getFCHCommonApi/getFCHLegacyApi, so swapping the registry
 * entries is enough to redirect all subsequent requests.
 */
export async function reinitializeFchProviders(
  baseUrl: string,
  clientPrivkeyHex?: string,
  fid?: string,
): Promise<void> {
  const fchCommonApi = new CommonAPI(baseUrl, CoinType.FCH);
  const fchLegacyApi = new FreecashAPI({baseUrl});
  registry.fchCommonApi = fchCommonApi;
  registry.fchLegacyApi = fchLegacyApi;
  registry.providers.set(CoinType.FCH, fchCommonApi);

  if (!clientPrivkeyHex) return;

  try {
    // Fetch the new server's pubkey and wire up encrypted requests on both APIs.
    await fchCommonApi.init(clientPrivkeyHex);
    await fchLegacyApi.init();
    fchLegacyApi.setClientKey(clientPrivkeyHex, fid || '');
  } catch (e: any) {
    console.warn('[reinitializeFchProviders] FCH API not ready:', e?.message);
    // Providers still point at the new URL; keys can be set on next login.
  }
}

export function setProvider(coin: CoinType, provider: CoinAPI): void {
  registry.providers.set(coin, provider);
}

export async function fetchAllBalances(
  addresses: Record<CoinType, string>,
): Promise<Record<CoinType, string>> {
  const results: Partial<Record<CoinType, string>> = {};
  const errors: string[] = [];

  const coins = Object.values(CoinType);
  const promises = coins.map(async coin => {
    try {
      const provider = registry.providers.get(coin);
      if (provider && addresses[coin]) {
        results[coin] = await provider.getBalance(addresses[coin]);
      } else {
        results[coin] = '0';
      }
    } catch (err: any) {
      results[coin] = '0';
      errors.push(`${coin}: ${err.message}`);
    }
  });

  await Promise.all(promises);

  if (errors.length > 0) {
    // Log errors so they can be seen in Metro console
    console.warn('[fetchAllBalances] Errors:', errors.join('; '));
  }

  return results as Record<CoinType, string>;
}
