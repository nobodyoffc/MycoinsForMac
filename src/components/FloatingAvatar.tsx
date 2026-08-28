import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Avatar} from './Avatar';
import {useAccountStore} from '../store/account-store';
import {formatAddress} from '../utils/format';

export function FloatingAvatar() {
  const navigate = useNavigate();
  const isLoggedIn = useAccountStore(s => s.isLoggedIn);
  const activeKeyId = useAccountStore(s => s.activeKeyId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  if (!isLoggedIn || !activeKeyId) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeKeyId).then(() => setCopied(true));
  };

  return (
    <>
      <div className="floating-avatar">
        <button
          aria-label="Show avatar"
          onClick={() => setDialogOpen(true)}>
          <span className="avatar-slot">
            <Avatar address={activeKeyId} size={28} />
          </span>
        </button>
        <button onClick={() => navigate('/keys')} title="Manage keys">
          {formatAddress(activeKeyId, 6, 6)}
        </button>
      </div>

      {copied && !dialogOpen && <div className="floating-toast">Copied</div>}

      {dialogOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setDialogOpen(false)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <div className="avatar-dialog-content">
              <div className="avatar-frame">
                <Avatar address={activeKeyId} size={200} />
              </div>
              <p className="addr">{activeKeyId}</p>
              <button
                className="btn"
                style={{width: '100%'}}
                onClick={handleCopy}>
                {copied ? 'Copied ✓' : 'Copy Address'}
              </button>
              <button
                className="btn-ghost"
                style={{width: '100%'}}
                onClick={() => setDialogOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
