import {useCallback, useEffect, useRef, useState} from 'react';
import jsQR from 'jsqr';

type Tab = 'camera' | 'image';

interface Props {
  title: string;
  /** Extra hint shown under the title, e.g. what kind of code is expected. */
  hint?: string;
  onResult: (text: string) => void;
  onClose: () => void;
}

/** Longest edge we downscale a frame to before running the decoder. */
const DECODE_MAX_EDGE = 800;

let decodeCanvas: HTMLCanvasElement | null = null;

/**
 * Decode a QR code out of anything drawable (video frame, bitmap, image).
 * Large sources are scaled down first — jsQR walks every pixel, so a full
 * 4K screenshot costs an order of magnitude more than it needs to.
 */
function decodeDrawable(
  source: CanvasImageSource,
  width: number,
  height: number,
): string | null {
  if (!width || !height) return null;

  const scale = Math.min(1, DECODE_MAX_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  // Reused across frames — the decode loop runs at display rate, and a fresh
  // canvas per frame churns memory for nothing.
  const canvas = (decodeCanvas ??= document.createElement('canvas'));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);

  const image = ctx.getImageData(0, 0, w, h);
  const found = jsQR(image.data, w, h, {inversionAttempts: 'attemptBoth'});
  return found?.data.trim() || null;
}

async function decodeImageFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    return decodeDrawable(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

export function QrScannerModal({title, hint, onResult, onClose}: Props) {
  const [tab, setTab] = useState<Tab>('camera');
  const [cameraError, setCameraError] = useState('');
  const [imageError, setImageError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [starting, setStarting] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // onResult may close the modal; keep the latest one without restarting the
  // camera effect every render.
  const resultRef = useRef(onResult);
  resultRef.current = onResult;

  const handleImage = useCallback(async (file: File) => {
    setImageError('');
    try {
      const text = await decodeImageFile(file);
      if (text) {
        resultRef.current(text);
      } else {
        setImageError('No QR code found in that image.');
      }
    } catch {
      setImageError('Could not read that file as an image.');
    }
  }, []);

  // --- Camera capture + decode loop ---
  useEffect(() => {
    if (tab !== 'camera') return;

    let cancelled = false;
    setStarting(true);
    setCameraError('');

    const scan = () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        const text = decodeDrawable(
          video,
          video.videoWidth,
          video.videoHeight,
        );
        if (text) {
          resultRef.current(text);
          return;
        }
      }
      frameRef.current = requestAnimationFrame(scan);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) {
          setCameraError('This system has no camera available.');
          setStarting(false);
        }
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: {ideal: 1280},
            height: {ideal: 720},
          },
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        setStarting(false);
        frameRef.current = requestAnimationFrame(scan);
      } catch (err) {
        if (cancelled) return;
        const name = (err as DOMException)?.name;
        setCameraError(
          name === 'NotAllowedError'
            ? 'Camera access was denied. Allow it in System Settings › Privacy & Security › Camera, or scan an image file instead.'
            : name === 'NotFoundError'
            ? 'No camera was found. Scan an image file instead.'
            : `Camera unavailable: ${(err as Error).message}`,
        );
        setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [tab]);

  // Esc closes, ⌘V / Ctrl+V pastes an image or text from the clipboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const image = items.find(i => i.type.startsWith('image/'));
      if (image) {
        const file = image.getAsFile();
        if (file) {
          e.preventDefault();
          setTab('image');
          handleImage(file);
        }
        return;
      }
      const text = e.clipboardData?.getData('text')?.trim();
      if (text) {
        e.preventDefault();
        resultRef.current(text);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, [onClose, handleImage]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel scanner-panel"
        onClick={e => e.stopPropagation()}>
        <h2>{title}</h2>
        {hint && <div className="desc">{hint}</div>}

        <div className="pill-row scanner-tabs">
          <button
            className={`pill${tab === 'camera' ? ' active' : ''}`}
            onClick={() => setTab('camera')}>
            Camera
          </button>
          <button
            className={`pill${tab === 'image' ? ' active' : ''}`}
            onClick={() => setTab('image')}>
            Image
          </button>
        </div>

        {tab === 'camera' ? (
          <div className="scanner-stage">
            <video ref={videoRef} muted playsInline />
            <div className="scanner-reticle" />
            {(starting || cameraError) && (
              <div className="scanner-overlay">
                {cameraError || 'Starting camera…'}
              </div>
            )}
          </div>
        ) : (
          <div
            className={`scanner-drop${dragging ? ' dragging' : ''}`}
            onDragOver={e => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleImage(file);
            }}
            onClick={() => fileInputRef.current?.click()}>
            <div className="scanner-drop-title">
              Drop a QR image here, or click to choose one
            </div>
            <div className="scanner-drop-sub">
              ⌘V also works — paste a screenshot, or paste the text directly.
            </div>
          </div>
        )}

        {/* Kept outside the drop zone: a programmatic click() on the input
            bubbles, and inside the zone it would re-enter its own onClick. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleImage(file);
            e.target.value = '';
          }}
        />

        {tab === 'image' && imageError && (
          <div style={{color: 'var(--color-error)', marginTop: 'var(--space-sm)'}}>
            {imageError}
          </div>
        )}

        <button
          className="btn-ghost"
          style={{
            width: '100%',
            color: 'var(--color-primary)',
            marginTop: 'var(--space-md)',
          }}
          onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
