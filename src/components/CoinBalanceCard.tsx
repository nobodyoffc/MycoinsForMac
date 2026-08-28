import {useEffect, useState} from 'react';
import {CoinType} from '../coins/types';
import {COINS} from '../coins/registry';
import {formatAddress, coinColor} from '../utils/format';

const ERC20_COINS: CoinType[] = [CoinType.USDT, CoinType.USDC];

interface Props {
  coin: CoinType;
  balance: string;
  address: string;
  onClick: () => void;
}

export function CoinBalanceCard({coin, balance, address, onClick}: Props) {
  const config = COINS[coin];
  const color = coinColor(coin);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => setCopied(true));
  };

  return (
    <div className="coin-row" onClick={onClick}>
      <div className="coin-icon" style={{background: color + '20'}}>
        <span className="ticker" style={{color}}>
          {config.ticker}
        </span>
        {ERC20_COINS.includes(coin) && <span className="chain-label">ETH</span>}
      </div>
      <div className="coin-info">
        <div className="coin-name">{config.name}</div>
        <div className="coin-addr" onClick={handleCopy}>
          {formatAddress(address)}
        </div>
      </div>
      <div className="coin-balance">
        <div className="amount">{balance}</div>
        <div className="ticker">{config.ticker}</div>
      </div>
      {copied && <div className="toast-inline">Copied</div>}
    </div>
  );
}
