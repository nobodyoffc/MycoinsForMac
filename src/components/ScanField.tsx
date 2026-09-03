import {ReactNode, useState} from 'react';
import {QrScannerModal} from './QrScannerModal';

interface Props {
  /**
   * `inline` parks the icon against the right edge of a single-line input;
   * `corner` drops it into the bottom-right corner of a textarea.
   */
  variant: 'inline' | 'corner';
  /** Title shown on the scanner modal, e.g. "Scan Recipient FID". */
  title: string;
  hint?: string;
  onScan: (text: string) => void;
  children: ReactNode;
}

function ScanIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round">
        <path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8" />
        <path d="M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8" />
        <path d="M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16" />
        <path d="M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
        <path d="M7 12h10" />
      </g>
    </svg>
  );
}

/**
 * Wraps a text input or textarea and overlays a QR scan button on it.
 * The scanned text is handed to `onScan` verbatim — callers decide whether
 * to parse it (payment URIs, cipher JSON, …) before storing it.
 */
export function ScanField({variant, title, hint, onScan, children}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`scan-field scan-field-${variant}`}>
      {children}
      <button
        type="button"
        className="scan-btn"
        title={title}
        aria-label={title}
        onClick={() => setOpen(true)}>
        <ScanIcon />
      </button>
      {open && (
        <QrScannerModal
          title={title}
          hint={hint}
          onClose={() => setOpen(false)}
          onResult={text => {
            setOpen(false);
            onScan(text);
          }}
        />
      )}
    </div>
  );
}
