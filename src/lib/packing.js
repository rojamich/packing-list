// Pack state.
//
// An item can have several units (6 merino socks), so packing is counted in
// units rather than a checkbox: of `qty` units, `packedQty` are in the bag and
// `wornQty` are going on your body on travel day. Those two are independent
// counts, so "4 packed, 1 worn, 1 still out" is expressible — worn items don't
// count toward bag weight, which is the whole reason they're tracked apart.
//
// `wornQty` replaced an older whole-item `worn` flag. Reads tolerate that shape,
// and the legacy `packed` / `packStatus` / `worn` fields are still mirrored on
// write, so nothing breaks for items written before any of this existed.

const clamp = (lo, hi, n) => Math.max(lo, Math.min(hi, Math.floor(n)));

export function itemQty(item) {
  const n = Number(item?.qty);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

/**
 * Statuses:
 *   unpacked — nothing accounted for
 *   partial  — some units handled, some still out
 *   packed   — every unit in a bag
 *   worn     — every unit on your body
 *   mixed    — every unit handled, split between packed and worn
 */
export function getPackState(item) {
  const qty = itemQty(item);

  let wornQty = Number(item?.wornQty);
  if (!Number.isFinite(wornQty)) {
    // Legacy: worn was a whole-item flag, so it meant all of them.
    wornQty = (item?.worn === true || item?.packStatus === 'worn') ? qty : 0;
  }

  let packedQty = Number(item?.packedQty);
  if (!Number.isFinite(packedQty)) {
    const legacy = item?.packStatus || (item?.packed ? 'packed' : 'unpacked');
    packedQty = legacy === 'packed' ? qty : 0;
  }

  // Worn wins the clamp: a unit on your body cannot also be in a bag.
  wornQty = clamp(0, qty, wornQty);
  packedQty = clamp(0, qty - wornQty, packedQty);

  const doneQty = packedQty + wornQty;

  const status =
    doneQty === 0     ? 'unpacked' :
    doneQty < qty     ? 'partial'  :
    wornQty === qty   ? 'worn'     :
    packedQty === qty ? 'packed'   :
                        'mixed';

  return { qty, packedQty, wornQty, doneQty, remaining: qty - doneQty, status };
}

/** Fields to write for a given state — keeps the legacy mirrors in sync. */
export function packFields(qty, packedQty, wornQty) {
  const total = itemQty({ qty });
  const w = clamp(0, total, wornQty || 0);
  const p = clamp(0, total - w, packedQty || 0);
  const done = p + w;

  const status =
    done === 0    ? 'unpacked' :
    done < total  ? 'partial'  :
    w === total   ? 'worn'     :
    p === total   ? 'packed'   :
                    'mixed';

  return {
    packedQty: p,
    wornQty: w,
    // Legacy mirrors. An old reader only understands whole-item states, so it
    // is told 'worn' or 'packed' only when that is unambiguously true of every
    // unit; anything split reads as unpacked rather than as a lie.
    worn: w === total && total > 0,
    packed: p === total && total > 0,
    packStatus: w === total ? 'worn' : p === total ? 'packed' : 'unpacked',
  };
}

/** Tapping the status circle: anything unfinished → all packed → all worn → clear. */
export function cyclePack(item) {
  const { qty, status } = getPackState(item);
  if (status === 'packed') return packFields(qty, 0, qty);
  if (status === 'worn')   return packFields(qty, 0, 0);
  return packFields(qty, qty, 0);
}

/**
 * Move one unit in or out of a count. `which` is 'packed' or 'worn'.
 * Raising worn past what's left takes units back out of the bag rather than
 * refusing — you took the shirt out to put it on.
 */
export function stepPack(item, delta, which = 'packed') {
  const { qty, packedQty, wornQty } = getPackState(item);

  if (which === 'worn') {
    const w = clamp(0, qty, wornQty + delta);
    return packFields(qty, Math.min(packedQty, qty - w), w);
  }

  const p = clamp(0, qty - wornQty, packedQty + delta);
  return packFields(qty, p, wornQty);
}

/** Unit totals across a list — used for progress bars. */
export function packTotals(items) {
  let total = 0, packed = 0, worn = 0;
  items.forEach((item) => {
    const s = getPackState(item);
    total  += s.qty;
    packed += s.packedQty;
    worn   += s.wornQty;
  });
  return { total, packed, worn, done: packed + worn };
}
