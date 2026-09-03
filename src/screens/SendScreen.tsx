import {useState} from 'react';
import {Navigate, useNavigate, useParams} from 'react-router-dom';
import {CoinType} from '../coins/types';
import {COINS} from '../coins/registry';
import {sendTransaction} from '../coins/send-service';
import {useAccountStore} from '../store/account-store';
import {useWalletStore} from '../store/wallet-store';
import {verifyPassword} from '../account/account';
import {formatCoinBalance, coinColor} from '../utils/format';
import {parseCoin} from '../utils/coin-param';
import {parsePaymentTarget} from '../utils/scan-parse';
import {ScanField} from '../components/ScanField';

export function SendScreen() {
  const navigate = useNavigate();
  const {coin: coinParam} = useParams();
  const coin = parseCoin(coinParam);

  const keys = useAccountStore(s => s.keys);
  const activeKeyId = useAccountStore(s => s.activeKeyId);
  const currentAccount = useAccountStore(s => s.currentAccount);
  const balances = useWalletStore(s => s.balances);
  const addPendingTx = useWalletStore(s => s.addPendingTx);

  const activeKey = keys.find(k => k.id === activeKeyId);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [modalError, setModalError] = useState('');
  const [sendResult, setSendResult] = useState<{
    success: boolean;
    message: string;
    txid?: string;
  } | null>(null);

  if (!coin || !balances[coin]) {
    return <Navigate to="/dashboard" replace />;
  }

  const config = COINS[coin];
  const color = coinColor(coin);
  const balance = balances[coin];

  // FCH OP_RETURN allows 1..4092 bytes. The limit is in UTF-8 bytes, not
  // characters, so multibyte text (e.g. CJK) counts more than one byte each.
  // Reject input that would exceed it rather than truncating mid-character.
  const setMemoWithinLimit = (next: string) => {
    if (new TextEncoder().encode(next).length <= 4092) setMemo(next);
  };

  const handleScanRecipient = (text: string) => {
    const parsed = parsePaymentTarget(text);
    setRecipient(parsed.address);
    if (parsed.amount) setAmount(parsed.amount);
    if (parsed.memo && coin === CoinType.FCH) setMemoWithinLimit(parsed.memo);
    setError('');
  };

  const handleScanMemo = (text: string) => setMemoWithinLimit(text);

  const openPasswordModal = () => {
    setError('');
    if (!recipient.trim()) {
      setError('Please enter a recipient address');
      return;
    }
    if (!amount.trim() || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (activeKey?.isWatchOnly) {
      setError('Cannot send from a watch-only key');
      return;
    }
    setPassword('');
    setModalError('');
    setShowPasswordModal(true);
  };

  const handleConfirmSend = async () => {
    if (!password.trim()) {
      setModalError('Please enter your password');
      return;
    }
    if (!currentAccount || !verifyPassword(password, currentAccount.id)) {
      setModalError('Incorrect password');
      return;
    }
    setShowPasswordModal(false);
    setLoading(true);

    try {
      const amountStr = amount.trim();
      const result = await sendTransaction({
        coin,
        fromAddress: balance.address,
        toAddress: recipient.trim(),
        amount: amountStr,
        privateKey: activeKey!.privateKey!,
        opReturn: coin === CoinType.FCH ? memo.trim() || undefined : undefined,
      });

      const decimals = config.decimals;
      const parts = amountStr.split('.');
      const intPart = parts[0] || '0';
      let fracPart = parts[1] || '';
      fracPart = fracPart.padEnd(decimals, '0').slice(0, decimals);
      const rawAmount = intPart + fracPart;

      addPendingTx({
        txid: result.txid,
        coin,
        fromAddress: balance.address,
        toAddress: recipient.trim(),
        amount: rawAmount,
        fee: '0',
        timestamp: Date.now(),
      });

      setSendResult({
        success: true,
        message: 'Transaction broadcast successfully.',
        txid: result.txid,
      });
    } catch (err) {
      // Surface the reason/result returned by the server (or provider) in a
      // dedicated window so the user can read why the broadcast failed.
      setSendResult({
        success: false,
        message: (err as Error).message || 'Unknown error',
      });
    } finally {
      setLoading(false);
      setPassword('');
    }
  };

  return (
    <div>
      <div className="coin-hero" style={{background: color + '15'}}>
        <div className="coin-hero-name" style={{fontWeight: 700}}>
          Send {config.name}
        </div>
        <div
          style={{
            color: 'var(--color-text-secondary)',
            marginTop: 'var(--space-xs)',
          }}>
          Available: {formatCoinBalance(balance.balanceRaw, coin)}{' '}
          {config.ticker}
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="to">Recipient Address</label>
        <ScanField
          variant="inline"
          title={`Scan ${config.ticker} Address`}
          hint="Point the camera at the recipient's QR code, or scan an image of one."
          onScan={handleScanRecipient}>
          <input
            id="to"
            className="mono"
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            placeholder={`Enter ${config.ticker} address`}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </ScanField>
      </div>

      <div className="form-group">
        <label htmlFor="amt">Amount ({config.ticker})</label>
        <input
          id="amt"
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0.00"
        />
      </div>

      {coin === CoinType.FCH && (
        <div className="form-group">
          <label htmlFor="memo">Note (OP_RETURN)</label>
          <ScanField
            variant="corner"
            title="Scan Note (OP_RETURN)"
            hint="Scan a QR code holding the text to record on-chain."
            onScan={handleScanMemo}>
            <textarea
              id="memo"
              rows={3}
              value={memo}
              onChange={e => setMemoWithinLimit(e.target.value)}
              placeholder="Optional message to record on-chain"
            />
          </ScanField>
          <small style={{color: 'var(--text-secondary)'}}>
            {new TextEncoder().encode(memo).length} / 4092 bytes
          </small>
        </div>
      )}

      {config.model === 'utxo' && (
        <div className="card" style={{marginBottom: 'var(--space-lg)'}}>
          <div
            style={{
              fontSize: 'var(--font-sm)',
              color: 'var(--color-text-secondary)',
              marginBottom: 'var(--space-xs)',
            }}>
            Fee Rate
          </div>
          <div>Auto (fetched from network)</div>
        </div>
      )}

      {error && (
        <div
          style={{
            color: 'var(--color-error)',
            marginBottom: 'var(--space-md)',
          }}>
          {error}
        </div>
      )}

      <button
        className="btn"
        style={{background: color, width: '100%', padding: '10px 16px'}}
        onClick={openPasswordModal}
        disabled={loading}>
        {loading ? 'Sending…' : `Send ${config.ticker}`}
      </button>

      {showPasswordModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowPasswordModal(false)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <h2>Confirm Password</h2>
            <div className="desc">
              Send {amount} {config.ticker} to:
            </div>
            <div className="addr">{recipient}</div>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConfirmSend()}
              placeholder="Enter your password"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 'var(--font-md)',
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
              style={{
                background: color,
                width: '100%',
                marginBottom: 'var(--space-sm)',
              }}
              onClick={handleConfirmSend}>
              Confirm Send
            </button>
            <button
              className="btn-ghost"
              style={{width: '100%', color: 'var(--color-primary)'}}
              onClick={() => {
                setShowPasswordModal(false);
                setPassword('');
              }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {sendResult && (
        <div
          className="modal-backdrop"
          onClick={() => {
            const wasSuccess = sendResult.success;
            setSendResult(null);
            if (wasSuccess) navigate(`/coins/${coin}`);
          }}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <h2
              style={{
                color: sendResult.success
                  ? 'var(--color-text)'
                  : 'var(--color-error)',
              }}>
              {sendResult.success ? 'Transaction Sent' : 'Send Failed'}
            </h2>
            <div className="desc">{sendResult.message}</div>
            {sendResult.txid && (
              <>
                <div
                  style={{
                    fontSize: 'var(--font-sm)',
                    color: 'var(--color-text-secondary)',
                    marginTop: 'var(--space-sm)',
                  }}>
                  TXID
                </div>
                <div className="addr mono">{sendResult.txid}</div>
              </>
            )}
            <button
              className="btn"
              style={{
                background: sendResult.success ? color : 'var(--color-error)',
                width: '100%',
                marginTop: 'var(--space-md)',
              }}
              onClick={() => {
                const wasSuccess = sendResult.success;
                setSendResult(null);
                if (wasSuccess) navigate(`/coins/${coin}`);
              }}>
              {sendResult.success ? 'Done' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
