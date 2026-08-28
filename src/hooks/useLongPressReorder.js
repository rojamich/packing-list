import { useCallback, useEffect, useRef, useState } from 'react';

// Hold-to-reorder for touch lists, without a drag-and-drop dependency.
//
// The gesture has to share the row with a plain tap (which packs the item), so:
//   • press and hold ~350ms  → picks the row up
//   • move before that       → it's a scroll, cancel the pick-up
//   • release                → commit the new order
//
// Row geometry is measured once at pick-up. Rows are similar heights, so slot
// math against those measurements stays accurate for the length of a drag.

const HOLD_MS = 350;
const MOVE_TOLERANCE = 10;   // px of finger drift allowed before it counts as a scroll
const EDGE = 72;             // auto-scroll zone at the top/bottom of the viewport
const EDGE_SPEED = 12;       // px per frame

function move(list, from, to) {
  if (from === to) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * @param {string[]} ids       Row ids in their current order.
 * @param {(ids: string[]) => void} onCommit  Called with the new order on drop.
 * @param {boolean} enabled    Turn the gesture off (e.g. while a filter is active).
 */
export default function useLongPressReorder(ids, onCommit, enabled = true) {
  const [dragId, setDragId] = useState(null);
  const [order, setOrder]   = useState(null);   // live order while dragging

  const rowRefs   = useRef(new Map());
  const holdTimer = useRef(null);
  const start     = useRef(null);   // { id, x, y }
  const rects     = useRef([]);     // measured at pick-up, in document coords
  const baseIds   = useRef([]);
  const orderRef  = useRef(null);
  const pointerY  = useRef(0);
  const rafId     = useRef(null);
  const swallowClick = useRef(false);   // the click that follows a drop

  const setRowRef = useCallback((id) => (el) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  }, []);

  const cancelHold = useCallback(() => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    start.current = null;
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = null; }
  }, []);

  const endDrag = useCallback((commit) => {
    stopAutoScroll();
    // Releasing fires a click right after pointerup; that click must not also
    // toggle the item that was just dropped.
    swallowClick.current = true;
    setTimeout(() => { swallowClick.current = false; }, 150);
    const finalOrder = orderRef.current;
    const changed = finalOrder && finalOrder.some((id, i) => id !== baseIds.current[i]);
    setDragId(null);
    setOrder(null);
    orderRef.current = null;
    if (commit && changed) onCommit(finalOrder);
  }, [onCommit, stopAutoScroll]);

  // Recompute which slot the finger is over and reorder to match.
  const updateSlot = useCallback(() => {
    const list = rects.current;
    if (!list.length) return;
    const y = pointerY.current;

    let acc = list[0].top;
    let target = list.length - 1;
    for (let i = 0; i < list.length; i++) {
      if (y < acc + list[i].height) { target = i; break; }
      acc += list[i].height;
    }

    const from = orderRef.current.indexOf(start.current.id);
    if (from === -1 || from === target) return;
    const next = move(orderRef.current, from, target);
    orderRef.current = next;
    setOrder(next);
  }, []);

  // While a row is lifted: keep the page from scrolling under the finger, and
  // auto-scroll when the finger reaches the top or bottom edge.
  useEffect(() => {
    if (!dragId) return;

    const block = (e) => e.preventDefault();
    document.addEventListener('touchmove', block, { passive: false });
    document.body.style.userSelect = 'none';

    const tick = () => {
      const vh = window.innerHeight;
      const viewportY = pointerY.current - window.scrollY;
      let dy = 0;
      if (viewportY < EDGE) dy = -EDGE_SPEED;
      else if (viewportY > vh - EDGE) dy = EDGE_SPEED;
      if (dy) {
        window.scrollBy(0, dy);
        pointerY.current += dy;
        updateSlot();
      }
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);

    return () => {
      document.removeEventListener('touchmove', block);
      document.body.style.userSelect = '';
      if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = null; }
    };
  }, [dragId, updateSlot]);

  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current); }, []);

  const getRowProps = useCallback((id) => {
    if (!enabled) return { ref: setRowRef(id) };

    return {
      ref: setRowRef(id),
      onPointerDown: (e) => {
        // Ignore secondary buttons and presses that land on a real control.
        if (e.button != null && e.button !== 0) return;
        if (e.target.closest('[data-no-drag]')) return;

        start.current = { id, x: e.clientX, y: e.clientY };
        pointerY.current = e.clientY + window.scrollY;
        const target = e.currentTarget;

        holdTimer.current = setTimeout(() => {
          holdTimer.current = null;
          const measured = ids
            .map((rowId) => {
              const el = rowRefs.current.get(rowId);
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return { id: rowId, top: r.top + window.scrollY, height: r.height };
            })
            .filter(Boolean);
          if (measured.length < 2) return;

          rects.current   = measured;
          baseIds.current = measured.map((m) => m.id);
          orderRef.current = [...baseIds.current];

          try { target.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
          navigator.vibrate?.(15);
          setOrder(orderRef.current);
          setDragId(id);
        }, HOLD_MS);
      },

      onPointerMove: (e) => {
        if (holdTimer.current && start.current) {
          const moved = Math.abs(e.clientY - start.current.y) + Math.abs(e.clientX - start.current.x);
          if (moved > MOVE_TOLERANCE) cancelHold();
          return;
        }
        if (!dragId) return;
        pointerY.current = e.clientY + window.scrollY;
        updateSlot();
      },

      onPointerUp: () => {
        if (holdTimer.current) { cancelHold(); return; }   // plain tap — let onClick run
        if (dragId) endDrag(true);
      },

      onPointerCancel: () => {
        if (holdTimer.current) { cancelHold(); return; }
        if (dragId) endDrag(false);
      },

      // A tap that turned into a drag must not also toggle the item.
      onClickCapture: (e) => {
        if (swallowClick.current || dragId) { e.preventDefault(); e.stopPropagation(); }
      },

      onContextMenu: (e) => { if (dragId) e.preventDefault(); },
    };
  }, [ids, dragId, enabled, setRowRef, cancelHold, endDrag, updateSlot]);

  return {
    dragId,
    /** Order to render while dragging; null when idle. */
    order,
    getRowProps,
    isDragging: dragId !== null,
  };
}
