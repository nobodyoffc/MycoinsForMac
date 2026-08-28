import {useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAccountStore} from '../store/account-store';
import {useWalletStore} from '../store/wallet-store';
import {CoinBalanceCard} from '../components/CoinBalanceCard';
import {CoinType} from '../coins/types';
import {formatCoinBalance} from '../utils/format';

const COIN_ORDER: CoinType[] = [
  CoinType.BTC,
  CoinType.ETH,
  CoinType.BCH,
  CoinType.FCH,
  CoinType.DOGE,
  CoinType.USDT,
  CoinType.USDC,
];

export function DashboardScreen() {
  const navigate = useNavigate();
  const keys = useAccountStore(s => s.keys);
  const activeKeyId = useAccountStore(s => s.activeKeyId);
  const balances = useWalletStore(s => s.balances);
  const isLoading = useWalletStore(s => s.isLoading);
  const initializeForKey = useWalletStore(s => s.initializeForKey);
  const refreshBalances = useWalletStore(s => s.refreshBalances);
  const getDisplayBalance = useWalletStore(s => s.getDisplayBalance);

  const activeKey = keys.find(k => k.id === activeKeyId);

  useEffect(() => {
    if (!activeKey) return;
    initializeForKey(activeKey.addresses);
    const t = setTimeout(() => refreshBalances(), 100);
    return () => clearTimeout(t);
  }, [activeKeyId, activeKey, initializeForKey, refreshBalances]);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-md)',
        }}>
        <h1 className="page-title" style={{margin: 0}}>
          Coins
        </h1>
        <button
          className="btn-secondary"
          style={{borderRadius: 6, padding: '6px 12px'}}
          onClick={() => refreshBalances()}
          disabled={isLoading}>
          {isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {COIN_ORDER.map(coin => {
        const b = balances[coin];
        const displayRaw = getDisplayBalance(coin);
        return (
          <CoinBalanceCard
            key={coin}
            coin={coin}
            balance={formatCoinBalance(displayRaw, coin)}
            address={b.address}
            onClick={() => navigate(`/coins/${coin}`)}
          />
        );
      })}
    </div>
  );
}
