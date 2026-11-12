import {create} from 'zustand';
import {CoinType, Transaction} from '../coins/types';
import {fetchAllBalances, getProvider} from '../api/api-registry';
import {formatCoinBalance} from '../utils/format';

// 'unfetched' = no fetch has returned yet this session (show '-')
// 'ok'        = last fetch succeeded (show the number, even if it's a real 0)
// 'error'     = last fetch failed (show cached number + '!', or bare '!')
type BalanceStatus = 'unfetched' | 'ok' | 'error';

interface CoinBalance {
  coin: CoinType;
  balance: string;
  balanceRaw: string;
  address: string;
  status: BalanceStatus;
  // True once any fetch has succeeded this session. Lets an 'error' status
  // distinguish "show stale cached value + !" from "show bare !".
  hasCachedValue: boolean;
}

interface PendingTx {
  txid: string;
  coin: CoinType;
  fromAddress: string;
  toAddress: string;
  amount: string; // raw amount in smallest unit
  fee: string;
  timestamp: number;
  // API balance (raw) at the moment this TX was broadcast. Used to detect when
  // the API already reflects the spend so we don't subtract it a second time.
  balanceAtSend?: string;
}

const PENDING_TX_EXPIRY = 60 * 60 * 1000; // 1 hour

interface WalletState {
  balances: Record<CoinType, CoinBalance>;
  transactions: Record<CoinType, Transaction[]>;
  pendingTxs: PendingTx[];
  isLoading: boolean;
  lastRefresh: number | null;

  // Actions
  setBalance: (coin: CoinType, balance: string, balanceRaw: string, address: string) => void;
  setBalances: (balances: Record<CoinType, CoinBalance>) => void;
  setTransactions: (coin: CoinType, txs: Transaction[]) => void;
  setLoading: (loading: boolean) => void;
  clearWallet: () => void;
  initializeForKey: (addresses: Record<CoinType, string>) => void;
  refreshBalances: () => Promise<void>;
  fetchTransactions: (coin: CoinType) => Promise<void>;
  addPendingTx: (tx: PendingTx) => void;
  getDisplayBalance: (coin: CoinType) => string;
  getDisplayBalanceText: (coin: CoinType) => string;
  getMergedTransactions: (coin: CoinType) => Transaction[];
}

const emptyBalance = (coin: CoinType, address: string = ''): CoinBalance => ({
  coin,
  balance: '0',
  balanceRaw: '0',
  address,
  status: 'unfetched',
  hasCachedValue: false,
});

const initialBalances: Record<CoinType, CoinBalance> = {
  [CoinType.BTC]: emptyBalance(CoinType.BTC),
  [CoinType.BCH]: emptyBalance(CoinType.BCH),
  [CoinType.FCH]: emptyBalance(CoinType.FCH),
  [CoinType.DOGE]: emptyBalance(CoinType.DOGE),
  [CoinType.ETH]: emptyBalance(CoinType.ETH),
  [CoinType.USDT]: emptyBalance(CoinType.USDT),
  [CoinType.USDC]: emptyBalance(CoinType.USDC),
};

const initialTransactions: Record<CoinType, Transaction[]> = {
  [CoinType.BTC]: [],
  [CoinType.BCH]: [],
  [CoinType.FCH]: [],
  [CoinType.DOGE]: [],
  [CoinType.ETH]: [],
  [CoinType.USDT]: [],
  [CoinType.USDC]: [],
};

export const useWalletStore = create<WalletState>((set, get) => ({
  balances: {...initialBalances},
  transactions: {...initialTransactions},
  pendingTxs: [],
  isLoading: false,
  lastRefresh: null,

  setBalance: (coin, balance, balanceRaw, address) => {
    set(state => ({
      balances: {
        ...state.balances,
        [coin]: {coin, balance, balanceRaw, address, status: 'ok', hasCachedValue: true},
      },
    }));
  },

  setBalances: (balances) => {
    set({balances, lastRefresh: Date.now()});
  },

  setTransactions: (coin, txs) => {
    set(state => ({
      transactions: {
        ...state.transactions,
        [coin]: txs,
      },
    }));
  },

  setLoading: (loading) => {
    set({isLoading: loading});
  },

  clearWallet: () => {
    set({
      balances: {...initialBalances},
      transactions: {...initialTransactions},
      pendingTxs: [],
      isLoading: false,
      lastRefresh: null,
    });
  },

  initializeForKey: (addresses) => {
    const balances: Record<CoinType, CoinBalance> = {} as any;
    for (const coin of Object.values(CoinType)) {
      balances[coin] = emptyBalance(coin, addresses[coin] || '');
    }
    set({
      balances,
      transactions: {...initialTransactions},
      pendingTxs: [],
      lastRefresh: null,
    });
  },

  refreshBalances: async () => {
    const {balances} = get();
    const addresses: Record<CoinType, string> = {} as any;
    for (const coin of Object.values(CoinType)) {
      addresses[coin] = balances[coin].address;
    }

    set({isLoading: true});
    try {
      const rawBalances = await fetchAllBalances(addresses);
      const prev = get().balances;
      // The active key may have changed while the request was in flight; a
      // result for the old key's addresses must not overwrite the new key's.
      if (Object.values(CoinType).some(c => prev[c].address !== addresses[c])) {
        return;
      }
      const updated: Record<CoinType, CoinBalance> = {} as any;
      for (const coin of Object.values(CoinType)) {
        const raw = rawBalances[coin];
        if (raw === null) {
          // Fetch failed: keep whatever we had (cached value or empty) and
          // flag the error so the UI can show '!' instead of a wrong 0.
          updated[coin] = {...prev[coin], status: 'error'};
        } else {
          updated[coin] = {
            coin,
            balanceRaw: raw,
            balance: formatCoinBalance(raw, coin),
            address: addresses[coin],
            status: 'ok',
            hasCachedValue: true,
          };
        }
      }
      set({balances: updated, lastRefresh: Date.now()});

      // Clean up pending TXs: remove confirmed, reflected, and expired ones
      const {pendingTxs, transactions} = get();
      const now = Date.now();
      const remaining = pendingTxs.filter(ptx => {
        // Remove if expired
        if (now - ptx.timestamp > PENDING_TX_EXPIRY) return false;
        // Remove if confirmed (txid appears in API history)
        const confirmedTxs = transactions[ptx.coin] || [];
        if (confirmedTxs.some(t => t.txid === ptx.txid)) return false;
        // Remove if the API balance already reflects this spend. Once a fresh
        // balance has dropped below the snapshot taken at send time, the spend
        // is already accounted for and subtracting it again would double-count.
        if (
          ptx.balanceAtSend !== undefined &&
          updated[ptx.coin]?.status === 'ok'
        ) {
          const newRaw = BigInt(updated[ptx.coin].balanceRaw || '0');
          if (newRaw < BigInt(ptx.balanceAtSend)) return false;
        }
        return true;
      });
      if (remaining.length !== pendingTxs.length) {
        set({pendingTxs: remaining});
      }
    } finally {
      set({isLoading: false});
    }
  },

  fetchTransactions: async (coin: CoinType) => {
    const {balances} = get();
    const address = balances[coin]?.address;
    if (!address) return;

    try {
      const provider = getProvider(coin);
      const txs = await provider.getTransactionHistory(address);
      set(state => ({
        transactions: {...state.transactions, [coin]: txs},
      }));

      // Clean up pending TXs that are now confirmed
      const {pendingTxs} = get();
      const confirmedIds = new Set(txs.map(t => t.txid));
      const remaining = pendingTxs.filter(
        ptx => ptx.coin !== coin || !confirmedIds.has(ptx.txid),
      );
      if (remaining.length !== pendingTxs.length) {
        set({pendingTxs: remaining});
      }
    } catch {
      // Keep existing txs
    }
  },

  addPendingTx: (tx: PendingTx) => {
    set(state => ({
      pendingTxs: [tx, ...state.pendingTxs],
    }));
  },

  // Display balance = API balance - pending outgoing amounts
  getDisplayBalance: (coin: CoinType): string => {
    const {balances, pendingTxs} = get();
    const apiBalance = BigInt(balances[coin]?.balanceRaw || '0');
    const pendingOut = pendingTxs
      .filter(ptx => ptx.coin === coin)
      .reduce((sum, ptx) => sum + BigInt(ptx.amount) + BigInt(ptx.fee || '0'), 0n);
    const display = apiBalance - pendingOut;
    return (display > 0n ? display : 0n).toString();
  },

  // User-facing balance string with fetch-state glyphs:
  //   '-'              before the first fetch returns (nothing known yet)
  //   '<number> !'     last fetch failed but we have a cached value (stale)
  //   '!'              last fetch failed and we never had a value
  //   '<number>'       last fetch succeeded (a real 0 shows as the number)
  getDisplayBalanceText: (coin: CoinType): string => {
    const b = get().balances[coin];
    if (!b || b.status === 'unfetched') return '-';
    if (b.status === 'error' && !b.hasCachedValue) return '!';
    const formatted = formatCoinBalance(get().getDisplayBalance(coin), coin);
    return b.status === 'error' ? `${formatted} !` : formatted;
  },

  // Merge confirmed TXs + pending TXs, no duplicates
  getMergedTransactions: (coin: CoinType): Transaction[] => {
    const {transactions, pendingTxs} = get();
    const confirmed = transactions[coin] || [];
    const confirmedIds = new Set(confirmed.map(t => t.txid));

    // Convert pending TXs to Transaction format, skip already confirmed ones
    const pendingAsTxs: Transaction[] = pendingTxs
      .filter(ptx => ptx.coin === coin && !confirmedIds.has(ptx.txid))
      .map(ptx => ({
        txid: ptx.txid,
        coin: ptx.coin,
        from: ptx.fromAddress,
        to: ptx.toAddress,
        amount: ptx.amount,
        fee: ptx.fee,
        timestamp: Math.floor(ptx.timestamp / 1000),
        confirmations: 0, // 0 = pending
        direction: 'out' as const,
      }));

    return [...pendingAsTxs, ...confirmed];
  },
}));
