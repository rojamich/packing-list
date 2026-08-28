// Pack state.
//
// An item can have several units (3 merino t-shirts), so packing is counted in
// units, not just a checkbox: `packedQty` of `qty` are in the bag. `worn` is a
// whole-item flag for things carried on your body on travel day (fleece, boots)
// — those don't count toward bag weight, so they're tracked separately.
//
// Reads tolerate the older shape (packStatus / packed) so nothing breaks for
// items written before partial packing existed.

export function itemQty(item) {
  const n = Number(item?.qty);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

export function getPackState(item) {
  const qty = itemQty(item);

  let worn = item?.worn === true;
  let packedQty = Number(item?.packedQty);

  if (!Number.isFinite(packedQty)) {
    // Legacy fallback.
    const legacy = item?.packStatus || (item?.packed ? 'packed' : 'unpacked');
    if (legacy === 'worn') { worn = true; packedQty = 0; }
    else if (legacy === 'packed') packedQty = qty;
    else packedQty = 0;
  }

  packedQty = Math.max(0, Math.min(qty, Math.floor(packedQty)));
  if (worn) packedQty = 0;

  const status =
    worn                ? 'worn' :
    packedQty >= qty    ? 'packed' :
    packedQty > 0       ? 'partial' :
                          'unpacked';

  return { qty, packedQty, worn, status, doneQty: worn ? qty : packedQty };
}

/** Fields to write for a given state — keeps the legacy fields in sync. */
export function packFields(qty, packedQty, worn) {
  const clamped = worn ? 0 : Math.max(0, Math.min(qty, Math.floor(packedQty)));
  const status = worn ? 'worn' : clamped >= qty ? 'packed' : clamped > 0 ? 'partial' : 'unpacked';
  return {
    packedQty: clamped,
    worn: !!worn,
    // Legacy mirrors — 'partial' reads as unpacked to anything old.
    packStatus: status === 'partial' ? 'unpacked' : status,
    packed: status === 'packed',
  };
}

/** Tapping the status circle: unpacked/partial → all packed → worn → unpacked. */
export function cyclePack(item) {
  const { qty, status } = getPackState(item);
  if (status === 'packed') return packFields(qty, 0, true);
  if (status === 'worn')   return packFields(qty, 0, false);
  return packFields(qty, qty, false);
}

/** Stepper on multi-unit items. Bumping the count always clears `worn`. */
export function stepPack(item, delta) {
  const { qty, packedQty, worn } = getPackState(item);
  const base = worn ? qty : packedQty;
  return packFields(qty, base + delta, false);
}

/** Unit totals across a list — used for progress bars. */
export function packTotals(items) {
  let total = 0, packed = 0, worn = 0;
  items.forEach((item) => {
    const s = getPackState(item);
    total += s.qty;
    if (s.worn) worn += s.qty;
    else packed += s.packedQty;
  });
  return { total, packed, worn, done: packed + worn };
}
