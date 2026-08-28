import {useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAccountStore} from '../store/account-store';
import {useWalletStore} from '../store/wallet-store';
import {Avatar} from '../components/Avatar';
import {formatAddress} from '../utils/format';

const HOLD_MS = 3000;

export function KeyListScreen() {
  const navigate = useNavigate();
  const keys = useAccountStore(s => s.keys);
  const activeKeyId = useAccountStore(s => s.activeKeyId);
  const setActiveKey = useAccountStore(s => s.setActiveKey);
  const removeKey = useAccountStore(s => s.removeKey);
  const currentAccount = useAccountStore(s => s.currentAccount);
  const initializeForKey = useWalletStore(s => s.initializeForKey);
  const clearWallet = useWalletStore(s => s.clearWallet);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const cancelHold = () => {
    if (holdTimer.current) {
      clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
    setHoldProgress(0);
  };

  useEffect(() => cancelHold, []);

  const handleSelectKey = (fchAddress: string) => {
    setActiveKey(fchAddress);
    const key = keys.find(k => k.id === fchAddress);
    if (key) initializeForKey(key.addresses);
    navigate('/dashboard');
  };

  const startHold = () => {
    if (!deleteTarget) return;
    setHoldProgress(0);
    const startTime = Date.now();
    holdTimer.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / HOLD_MS, 1);
      setHoldProgress(progress);
      if (progress >= 1) {
        cancelHold();
        doRemoveKey();
      }
    }, 50);
  };

  const doRemoveKey = async () => {
    if (!deleteTarget) return;
    const isLast = keys.length === 1;
    try {
      if (isLast) clearWallet();
      await removeKey(deleteTarget);
      setDeleteTarget(null);
    } catch (err) {
      window.alert((err as Error).message);
    }
  };

  const isLastKey = keys.length === 1;

  return (
    <div>
      <div style={{marginBottom: 'var(--space-lg)'}}>
        <h1 className="page-title" style={{marginBottom: 'var(--space-xs)'}}>
          Keys
        </h1>
        {currentAccount && (
          <div
            className="mono"
            style={{
              fontSize: 'var(--font-sm)',
              color: 'var(--color-text-secondary)',
            }}>
            Account: {currentAccount.id}
          </div>
        )}
      </div>

      {keys.length === 0 ? (
        <div className="empty-state">
          <div style={{fontSize: 'var(--font-lg)'}}>No keys yet</div>
          <div style={{marginTop: 'var(--space-xs)'}}>Add a key to get started</div>
        </div>
      ) : (
        keys.map(item => {
          const isActive = item.id === activeKeyId;
          return (
            <div
              key={item.id}
              className={`key-card${isActive ? ' active' : ''}`}
              onClick={() => handleSelectKey(item.id)}>
              <div className="key-header">
                <div className="key-header-right">
                  {isActive && <span className="active-badge">Active</span>}
                  <span className="key-label">
                    {item.isWatchOnly ? 'Watch Only' : 'Full Access'}
                  </span>
                  {!item.isWatchOnly && (
                    <span
                      className={`backup-badge${
                        item.backedUp ? ' done' : ' pending'
                      }`}>
                      {item.backedUp ? 'Backed Up' : 'Not Backed Up'}
                    </span>
                  )}
                </div>
                <button
                  className="delete-btn"
                  title="Remove key"
                  onClick={e => {
                    e.stopPropagation();
                    setDeleteTarget(item.id);
                  }}>
                  ✕
                </button>
              </div>
              <div className="key-body">
                <Avatar address={item.id} size={48} />
                <div className="key-info">
                  <div className="fch">{item.id}</div>
                  <div className="sub">BTC: {formatAddress(item.addresses.BTC)}</div>
                  <div className="sub">ETH: {formatAddress(item.addresses.ETH)}</div>
                </div>
              </div>
            </div>
          );
        })
      )}

      <button
        className="btn"
        style={{width: '100%', padding: '10px 16px', marginTop: 'var(--space-md)'}}
        onClick={() => navigate('/keys/add')}>
        + Add Key
      </button>

      {deleteTarget && (
        <div
          className="modal-backdrop"
          onClick={() => {
            cancelHold();
            setDeleteTarget(null);
          }}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <h2>Remove Key</h2>
            <div className="addr">{deleteTarget}</div>
            {isLastKey && (
              <div className="warn-text">
                This is the last key. Removing it will delete this account and log
                you out.
              </div>
            )}
            <div className="hint-text">
              Hold the button for {HOLD_MS / 1000} seconds to confirm
            </div>
            <button
              className="hold-btn"
              onMouseDown={startHold}
              onMouseUp={cancelHold}
              onMouseLeave={cancelHold}
              onTouchStart={startHold}
              onTouchEnd={cancelHold}>
              <div
                className="hold-fill"
                style={{width: `${holdProgress * 100}%`}}
              />
              <span className="hold-label">
                {holdProgress >= 1
                  ? 'Removing…'
                  : holdProgress > 0
                  ? `Hold ${Math.ceil(HOLD_MS / 1000 - holdProgress * (HOLD_MS / 1000))}s…`
                  : 'Hold to Remove'}
              </span>
            </button>
            <button
              className="btn-ghost"
              style={{width: '100%'}}
              onClick={() => {
                cancelHold();
                setDeleteTarget(null);
              }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
