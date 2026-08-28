import {useEffect, useRef, useState} from 'react';
import {Avatar} from './Avatar';
import {BackupPrikeyDialog} from './BackupPrikeyDialog';
import {useAccountStore} from '../store/account-store';

// Prompts once per key per session when the user enters an identity whose
// prikey has never been revealed or exported.
export function BackupReminder() {
  const keys = useAccountStore(s => s.keys);
  const activeKeyId = useAccountStore(s => s.activeKeyId);
  const isLoggedIn = useAccountStore(s => s.isLoggedIn);

  const [promptKeyId, setPromptKeyId] = useState<string | null>(null);
  const [backupKeyId, setBackupKeyId] = useState<string | null>(null);
  const asked = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isLoggedIn) {
      asked.current.clear();
      setPromptKeyId(null);
      setBackupKeyId(null);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !activeKeyId) return;
    const key = keys.find(k => k.id === activeKeyId);
    if (!key || key.isWatchOnly || !key.privateKey || key.backedUp) return;
    if (asked.current.has(activeKeyId)) return;
    asked.current.add(activeKeyId);
    setPromptKeyId(activeKeyId);
  }, [isLoggedIn, activeKeyId, keys]);

  if (backupKeyId) {
    return (
      <BackupPrikeyDialog
        keyId={backupKeyId}
        onClose={() => setBackupKeyId(null)}
      />
    );
  }

  if (!promptKeyId) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-panel">
        <div className="backup-dialog-head">
          <Avatar address={promptKeyId} size={44} />
          <h2 style={{margin: 0, fontSize: 'var(--font-lg)'}}>
            Back up this prikey
          </h2>
        </div>
        <div className="addr">{promptKeyId}</div>
        <div className="warn-text">
          This identity's prikey has never been backed up. If you lose this
          device or forget your password, the coins on it are gone for good.
        </div>
        <button
          className="btn"
          style={{width: '100%', padding: '8px 16px'}}
          onClick={() => {
            setBackupKeyId(promptKeyId);
            setPromptKeyId(null);
          }}>
          Back Up Now
        </button>
        <button
          className="btn-ghost"
          style={{width: '100%', marginTop: 'var(--space-sm)'}}
          onClick={() => setPromptKeyId(null)}>
          Later
        </button>
      </div>
    </div>
  );
}
