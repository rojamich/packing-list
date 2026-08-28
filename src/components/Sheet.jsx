import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

/**
 * The bottom sheet both modals sit in.
 *
 * Previously each one was a bare <div> over a clickable backdrop, which meant:
 * no dialog semantics for a screen reader, no focus trap, Escape did nothing,
 * focus never came back to whatever opened it, the page scrolled behind the
 * sheet on iOS, and — worst of it — the backdrop is a huge easy-to-brush target
 * directly above the sheet that discarded everything typed, silently.
 *
 * `dirty` turns that last one into a question instead of a loss.
 */

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let sheetSeq = 0;

export default function Sheet({ title, onClose, dirty = false, maxHeight = '92vh', children }) {
  const panelRef = useRef(null);
  const returnFocusTo = useRef(null);
  const titleId = useRef(`sheet-title-${++sheetSeq}`).current;

  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const requestClose = useCallback(() => {
    if (dirty) { setConfirmDiscard(true); return; }
    onClose();
  }, [dirty, onClose]);

  // Remember what opened the sheet, and hand focus back on the way out.
  useEffect(() => {
    returnFocusTo.current = document.activeElement;
    const panel = panelRef.current;
    // Focus the panel itself rather than the first field: on a phone, focusing
    // an input immediately would throw up the keyboard over the whole sheet.
    panel?.focus({ preventScroll: true });

    return () => {
      const el = returnFocusTo.current;
      if (el && typeof el.focus === 'function' && document.contains(el)) {
        el.focus({ preventScroll: true });
      }
    };
  }, []);

  // Stop the page behind from scrolling under the sheet.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Escape closes; Tab stays inside.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (confirmDiscard) { setConfirmDiscard(false); return; }
        requestClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const nodes = Array.from(panelRef.current?.querySelectorAll(FOCUSABLE) || [])
        .filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (nodes.length === 0) { e.preventDefault(); return; }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [requestClose, confirmDiscard]);

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/50" onClick={requestClose} />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full bg-white dark:bg-gray-900 rounded-t-2xl overflow-y-auto z-10 shadow-2xl focus:outline-none"
        style={{ maxHeight }}
      >
        <div className="sticky top-0 bg-white dark:bg-gray-900 flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 z-10">
          <h2 id={titleId} className="font-semibold text-gray-900 dark:text-white text-lg">
            {title}
          </h2>
          <button
            onClick={requestClose}
            aria-label="Close"
            className="p-2 -mr-2 text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X size={20} />
          </button>
        </div>

        {confirmDiscard && (
          <div className="sticky top-[57px] z-10 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center gap-3">
            <span className="flex-1 text-sm font-medium text-amber-900 dark:text-amber-200">
              Discard your changes?
            </span>
            <button
              onClick={() => setConfirmDiscard(false)}
              className="text-sm font-medium text-amber-900 dark:text-amber-200 px-2 py-1"
            >
              Keep editing
            </button>
            <button
              onClick={onClose}
              className="text-sm font-semibold text-white bg-red-600 px-3 py-1.5 rounded-lg active:bg-red-700"
            >
              Discard
            </button>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
