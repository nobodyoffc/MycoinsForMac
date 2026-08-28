import {useEffect, useState} from 'react';
import {Navigate, useLocation, useNavigate} from 'react-router-dom';
import {CoinType} from '../coins/types';
import {COINS} from '../coins/registry';
import {getProvider} from '../api/api-registry';
import {sendTransaction} from '../coins/send-service';
import {verifyPassword} from '../account/account';
import {useAccountStore} from '../store/account-store';
import {useWalletStore} from '../store/wallet-store';
import type {SwapService} from './SwapListScreen';

const TICKER_MAP: Record<string, CoinType> = {
  btc: CoinType.BTC,
  bch: CoinType.BCH,
  fch: CoinType.FCH,
  doge: CoinType.DOGE,
  eth: CoinType.ETH,
  usdt: CoinType.USDT,
  usdc: CoinType.USDC,
};

function tickerToCoinType(tick: string): CoinType | null {
  return TICKER_MAP[tick.toLowerCase()] ?? null;
}

function toHuman(raw: number, decimals: number): string {
  if (raw === 0) return '0';
  const str = raw.toString().padStart(decimals + 1, '0');
  const int = str.slice(0, -decimals) || '0';
  const frac = str.slice(-decimals).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}

function toRaw(human: string, decimals: number): number {
  const parts = human.split('.');
  const int = parts[0] || '0';
  let frac = parts[1] || '';
  frac = frac.padEnd(decimals, '0').slice(0, decimals);
  return parseInt(int + frac, 10) || 0;
}

export function SwapDetailScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const service = (location.state as {service?: SwapService} | null)?.service;

  const keys = useAccountStore(s => s.keys);
  const activeKeyId = useAccountStore(s => s.activeKeyId);
  const currentAccount = useAccountStore(s => s.currentAccount);
  const addPendingTx = useWalletStore(s => s.addPendingTx);
  const getDisplayBalance = useWalletStore(s => s.getDisplayBalance);
  const activeKey = keys.find(k => k.id === activeKeyId);

  const [gPoolRaw, setGPoolRaw] = useState(0);
  const [mPoolRaw, setMPoolRaw] = useState(0);
  const [gDecimals, setGDecimals] = useState(8);
  const [mDecimals, setMDecimals] = useState(8);
  const [loadingPool, setLoadingPool] = useState(true);
  const [direction, setDirection] = useState<'buyMoney' | 'buyGoods'>('buyMoney');
  const [inputAmount, setInputAmount] = useState('');
  const [outputAmount, setOutputAmount] = useState('');
  const [password, setPassword] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    if (!service) return;
    const p = service.params;
    const goodsCoin = tickerToCoinType(p.gTick);
    const moneyCoin = tickerToCoinType(p.mTick);

    (async () => {
      setLoadingPool(true);
      try {
        if (goodsCoin) {
          setGDecimals(COINS[goodsCoin].decimals);
          const bal = await getProvider(goodsCoin).getBalance(p.gAddr);
          setGPoolRaw(Number(bal));
        }
        if (moneyCoin) {
          setMDecimals(COINS[moneyCoin].decimals);
          const bal = await getProvider(moneyCoin).getBalance(p.mAddr);
          setMPoolRaw(Number(bal));
        }
      } catch (err) {
        console.warn('[SwapDetail] pool fetch failed:', (err as Error).message);
      } finally {
        setLoadingPool(false);
      }
    })();
  }, [service]);

  if (!service) {
    return <Navigate to="/swaps" replace />;
  }

  const p = service.params;
  const gTick = p.gTick.toUpperCase();
  const mTick = p.mTick.toUpperCase();
  const goodsCoin = tickerToCoinType(p.gTick);
  const moneyCoin = tickerToCoinType(p.mTick);
  const swapFeeRate =
    parseFloat(p.swapFee || '0') + parseFloat(p.serviceFee || '0');

  const sendTick = direction === 'buyMoney' ? gTick : mTick;
  const receiveTick = direction === 'buyMoney' ? mTick : gTick;
  const sendCoin = direction === 'buyMoney' ? goodsCoin : moneyCoin;
  const sendAddr = direction === 'buyMoney' ? p.gAddr : p.mAddr;
  const sendDecimals = direction === 'buyMoney' ? gDecimals : mDecimals;

  const myGoodsRaw = goodsCoin ? Number(getDisplayBalance(goodsCoin)) : 0;
  const myMoneyRaw = moneyCoin ? Number(getDisplayBalance(moneyCoin)) : 0;
  const mySendRaw = direction === 'buyMoney' ? myGoodsRaw : myMoneyRaw;

  const price =
    gPoolRaw > 0 && mPoolRaw > 0
      ? direction === 'buyMoney'
        ? mPoolRaw / Math.pow(10, mDecimals) / (gPoolRaw / Math.pow(10, gDecimals))
        : gPoolRaw / Math.pow(10, gDecimals) / (mPoolRaw / Math.pow(10, mDecimals))
      : 0;

  const calculate = (input: string) => {
    setInputAmount(input);
    const x = gPoolRaw;
    const y = mPoolRaw;
    if (x === 0 || y === 0 || !input || parseFloat(input) <= 0) {
      setOutputAmount('');
      return;
    }
    const k = x * y;
    const inDecimals = direction === 'buyMoney' ? gDecimals : mDecimals;
    const outDecimals = direction === 'buyMoney' ? mDecimals : gDecimals;
    const deltaIn = toRaw(input, inDecimals);

    if (direction === 'buyMoney') {
      const newX = x + deltaIn;
      const newY = Math.floor(k / newX);
      const deltaOut = y - newY;
      const received = Math.floor(deltaOut * (1 - swapFeeRate));
      setOutputAmount(received > 0 ? toHuman(received, outDecimals) : '0');
    } else {
      const newY = y + deltaIn;
      const newX = Math.floor(k / newY);
      const deltaOut = x - newX;
      const received = Math.floor(deltaOut * (1 - swapFeeRate));
      setOutputAmount(received > 0 ? toHuman(received, outDecimals) : '0');
    }
  };

  const handleSwap = () => {
    setModalError('');
    if (!inputAmount || parseFloat(inputAmount) <= 0) {
      window.alert('Please enter an amount');
      return;
    }
    if (!sendCoin) {
      window.alert(`${sendTick} is not supported`);
      return;
    }
    if (activeKey?.isWatchOnly) {
      window.alert('Cannot swap from a watch-only key');
      return;
    }
    setPassword('');
    setShowConfirm(true);
  };

  const handleConfirmSwap = async () => {
    if (!password.trim()) {
      setModalError('Please enter your password');
      return;
    }
    if (!currentAccount || !verifyPassword(password, currentAccount.id)) {
      setModalError('Incorrect password');
      return;
    }
    if (!sendCoin || !activeKey?.privateKey) return;

    setShowConfirm(false);
    setSending(true);
    try {
      const result = await sendTransaction({
        coin: sendCoin,
        fromAddress: activeKey.addresses[sendCoin],
        toAddress: sendAddr,
        amount: inputAmount,
        privateKey: activeKey.privateKey,
      });
      const rawAmount = toRaw(inputAmount, sendDecimals);
      addPendingTx({
        txid: result.txid,
        coin: sendCoin,
        fromAddress: activeKey.addresses[sendCoin],
        toAddress: sendAddr,
        amount: String(rawAmount),
        fee: '0',
        timestamp: Date.now(),
      });
      window.alert(
        `Swap Submitted\n\nSent ${inputAmount} ${sendTick} to swap pool.\nExpected: ~${outputAmount} ${receiveTick}\nTXID: ${result.txid}`,
      );
      navigate('/swaps');
    } catch (err) {
      window.alert(`Swap Failed: ${(err as Error).message}`);
    } finally {
      setSending(false);
      setPassword('');
    }
  };

  return (
    <div>
      <div className="swap-hero">
        <h1>
          {gTick} ⇄ {mTick}
        </h1>
        <div className="sub">
          {p.goods} / {p.money}
        </div>
      </div>

      <div className="section-title" style={{marginTop: 0}}>Pool Reserves</div>
      {loadingPool ? (
        <div className="empty-state" style={{padding: 'var(--space-md) 0'}}>
          Loading pool…
        </div>
      ) : (
        <div className="pool-row">
          <div className="pool-item">
            <div className="tick">{gTick}</div>
            <div className="val">{toHuman(gPoolRaw, gDecimals)}</div>
          </div>
          <div className="pool-item">
            <div className="tick">{mTick}</div>
            <div className="val">{toHuman(mPoolRaw, mDecimals)}</div>
          </div>
        </div>
      )}
      {price > 0 && (
        <div className="price-text">
          1 {sendTick} ≈ {price.toFixed(6)} {receiveTick}
        </div>
      )}

      <div className="direction-row">
        <button
          className={`pill${direction === 'buyMoney' ? ' active' : ''}`}
          onClick={() => {
            setDirection('buyMoney');
            setInputAmount('');
            setOutputAmount('');
          }}>
          {gTick} → {mTick}
        </button>
        <button
          className={`pill${direction === 'buyGoods' ? ' active' : ''}`}
          onClick={() => {
            setDirection('buyGoods');
            setInputAmount('');
            setOutputAmount('');
          }}>
          {mTick} → {gTick}
        </button>
      </div>

      <div className="my-bal-row">
        <div className="my-bal-item">
          <div className="label">My {gTick}</div>
          <div className="val">{toHuman(myGoodsRaw, gDecimals)}</div>
        </div>
        <div className="my-bal-item">
          <div className="label">My {mTick}</div>
          <div className="val">{toHuman(myMoneyRaw, mDecimals)}</div>
        </div>
      </div>

      <div className="form-group">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-xs)',
          }}>
          <label style={{margin: 0}}>You send ({sendTick})</label>
          <button
            className="max-btn"
            onClick={() => calculate(toHuman(mySendRaw, sendDecimals))}>
            MAX
          </button>
        </div>
        <input
          className="amount-input"
          type="text"
          inputMode="decimal"
          value={inputAmount}
          onChange={e => calculate(e.target.value)}
          placeholder="0.00"
        />
      </div>

      <div className="form-group">
        <label>You receive (estimated, {receiveTick})</label>
        <div className="output-box">{outputAmount || '0'}</div>
      </div>

      <div className="fee-row">
        <span className="fee-label">Total fee</span>
        <span>{(swapFeeRate * 100).toFixed(1)}%</span>
      </div>
      <div
        className="fee-row"
        style={{marginBottom: 'var(--space-lg)'}}>
        <span className="fee-label">Confirmations needed</span>
        <span>{direction === 'buyMoney' ? p.gConfirm : p.mConfirm}</span>
      </div>

      <button
        className="btn"
        style={{width: '100%', padding: '10px 16px'}}
        onClick={handleSwap}
        disabled={sending || loadingPool}>
        {sending ? 'Sending…' : `Swap ${sendTick} → ${receiveTick}`}
      </button>

      {showConfirm && (
        <div className="modal-backdrop" onClick={() => setShowConfirm(false)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <h2>Confirm Swap</h2>
            <div className="desc">
              Send {inputAmount} {sendTick} → receive ~{outputAmount}{' '}
              {receiveTick}
            </div>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConfirmSwap()}
              placeholder="Enter password"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                outline: 'none',
                marginBottom: 'var(--space-md)',
              }}
            />
            {modalError && (
              <div
                style={{
                  color: 'var(--color-error)',
                  marginBottom: 'var(--space-sm)',
                }}>
                {modalError}
              </div>
            )}
            <button
              className="btn"
              style={{width: '100%', marginBottom: 'var(--space-sm)'}}
              onClick={handleConfirmSwap}>
              Confirm
            </button>
            <button
              className="btn-ghost"
              style={{width: '100%'}}
              onClick={() => {
                setShowConfirm(false);
                setPassword('');
              }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
