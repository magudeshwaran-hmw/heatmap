/**
 * Modal.tsx — Shared modal/dialog primitive for the whole app.
 *
 * Encodes the correct, regression-proof modal pattern ONE time:
 *   • Backdrop:  position:fixed, inset:0, solid rgba(0,0,0,0.80), z-index 1000
 *   • Panel:     fully OPAQUE solid background (T.cardSolid), z-index 1001,
 *                responsive width (90vw on small screens, capped at maxWidth)
 *   • Rendered via React portal to document.body so it can never be trapped
 *     behind a parent with overflow:hidden or a lower stacking context.
 *   • Close behaviour: backdrop click, Escape key, and (optional) X button.
 *
 * Page modals should prefer this component. Modals too custom to refactor
 * safely must still match these exact background / z-index values manually.
 */
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDark, mkTheme } from '@/lib/themeContext';

export const MODAL_BACKDROP_BG = 'rgba(0,0,0,0.80)';
export const MODAL_Z_BACKDROP = 1000;
export const MODAL_Z_PANEL = 1001;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Max panel width in px on large screens. Panel is min(90vw, maxWidth). */
  maxWidth?: number;
  /** Show the built-in close (X) button in the top-right of the panel. */
  showClose?: boolean;
  /** Extra style merged onto the panel box. */
  panelStyle?: React.CSSProperties;
  /** Override backdrop opacity/colour if a specific modal needs it. */
  backdropStyle?: React.CSSProperties;
  /** aria-label for the dialog. */
  label?: string;
}

export default function Modal({
  open, onClose, children,
  maxWidth = 560, showClose = true,
  panelStyle, backdropStyle, label,
}: ModalProps) {
  const { dark } = useDark();
  const T = mkTheme(dark);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: MODAL_BACKDROP_BG,
        zIndex: MODAL_Z_BACKDROP,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        ...backdropStyle,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          background: T.cardSolid,          // 100% opaque — no bleed-through
          border: `1px solid ${T.bdr}`,
          borderRadius: 20,
          width: '100%',
          maxWidth,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          zIndex: MODAL_Z_PANEL,
          ...panelStyle,
        }}
      >
        {showClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute', top: 12, right: 12,
              background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
              border: 'none', borderRadius: 10, cursor: 'pointer',
              color: T.sub, padding: 6, display: 'flex',
              alignItems: 'center', justifyContent: 'center', zIndex: 1,
            }}
          >
            <X size={18} />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
