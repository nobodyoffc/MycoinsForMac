/**
 * App lifecycle management for security.
 * Clears decrypted keys when the window loses focus for longer
 * than the user's auto-lock threshold, requiring re-login.
 *
 * Uses Tauri window focus events when available, with DOM focus/blur
 * as a fallback. Either way, the check is only performed on *return*
 * to focus — we simply record a timestamp on blur.
 */

import {useAccountStore} from '../store/account-store';
import {useSettingsStore} from '../store/settings-store';
import {useWalletStore} from '../store/wallet-store';

let blurredAt: number | null = null;
let started = false;
let tauriUnlisten: (() => void) | null = null;

function handleBlur() {
  blurredAt = Date.now();
}

function handleFocus() {
  if (blurredAt === null) return;
  const elapsed = Date.now() - blurredAt;
  blurredAt = null;

  if (!useAccountStore.getState().isLoggedIn) return;

  const minutes = useSettingsStore.getState().autoLockMinutes;
  if (minutes <= 0) return; // 0 = disabled

  const thresholdMs = minutes * 60 * 1000;
  if (elapsed > thresholdMs) {
    useWalletStore.getState().clearWallet();
    useAccountStore.getState().logout();
  }
}

async function tryWireTauriFocus(): Promise<boolean> {
  try {
    const {getCurrentWindow} = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    const unlisten = await win.onFocusChanged(({payload: focused}) => {
      if (focused) handleFocus();
      else handleBlur();
    });
    tauriUnlisten = unlisten;
    return true;
  } catch {
    return false;
  }
}

export function startAppLifecycleMonitor() {
  if (started) return;
  started = true;

  tryWireTauriFocus().then(wired => {
    if (!wired) {
      // Fallback: DOM focus/blur. Tauri's webview forwards these when the
      // window itself gains/loses focus at the OS level.
      window.addEventListener('blur', handleBlur);
      window.addEventListener('focus', handleFocus);
    }
  });
}

export function stopAppLifecycleMonitor() {
  if (!started) return;
  started = false;
  window.removeEventListener('blur', handleBlur);
  window.removeEventListener('focus', handleFocus);
  if (tauriUnlisten) {
    tauriUnlisten();
    tauriUnlisten = null;
  }
  blurredAt = null;
}
