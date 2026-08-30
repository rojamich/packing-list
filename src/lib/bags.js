// Bag identity.
//
// Items reference bags by *name* (`item.inBag`), not by id. That is why
// duplicates appear: create "Scree 32" in the app while the seeded bag is
// called "Jen (Scree 32)", or import a sheet whose inBag column is spelled
// slightly differently, and you end up with two bags holding two halves of the
// same pile. The importer auto-creates any bag name it doesn't recognise, which
// makes that a one-keystroke mistake.
//
// This module is what the merge tool and the duplicate warnings are built on.

/** Lowercase, drop punctuation, collapse whitespace: "Jen (Scree 32)" -> "jen scree 32". */
export function normalizeBagName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** True when two names differ only by case, punctuation or spacing. */
export function sameBagName(a, b) {
  const na = normalizeBagName(a);
  return na.length > 0 && na === normalizeBagName(b);
}

/**
 * True when one name is the other with extra words around it — "Scree 32"
 * inside "Jen (Scree 32)". Matched on word boundaries so "Sling" doesn't
 * swallow "Slingshot", and the shorter side must carry some actual content.
 */
export function nameContains(outer, inner) {
  const o = normalizeBagName(outer);
  const i = normalizeBagName(inner);
  if (!o || !i || o === i) return false;
  if (i.length < 3) return false;
  return new RegExp(`(^| )${i.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(o);
}

const countItems = (items, bagName) =>
  items.filter((i) => i.inBag === bagName).length;

/**
 * Groups of bags that look like the same real bag.
 *
 * `reason` is 'exact' when the names normalize identically — those are almost
 * certainly duplicates — or 'similar' when one name sits inside another, which
 * is a strong hint but wants a human to confirm.
 *
 * The bag holding the most items is suggested as the one to keep, since that is
 * the one most things already point at.
 */
export function findDuplicateBags(bags = [], items = []) {
  const groups = [];
  const claimed = new Set();

  const withCounts = bags.map((b) => ({
    id: b.id,
    name: b.name,
    emoji: b.emoji || '🎒',
    owner: b.owner,
    itemCount: countItems(items, b.name),
  }));

  // Exact normalized matches first — they are unambiguous, and claiming them
  // here keeps them out of the fuzzier pass below.
  const byKey = new Map();
  withCounts.forEach((b) => {
    const k = normalizeBagName(b.name);
    if (!k) return;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(b);
  });

  byKey.forEach((list, key) => {
    if (list.length < 2) return;
    list.forEach((b) => claimed.add(b.id));
    groups.push({ key, reason: 'exact', bags: sortBySuggestion(list) });
  });

  // Then names that sit inside other names.
  withCounts.forEach((outer) => {
    if (claimed.has(outer.id)) return;
    const inside = withCounts.filter(
      (inner) => inner.id !== outer.id && !claimed.has(inner.id) && nameContains(outer.name, inner.name),
    );
    if (inside.length === 0) return;
    const list = [outer, ...inside];
    list.forEach((b) => claimed.add(b.id));
    groups.push({ key: normalizeBagName(outer.name), reason: 'similar', bags: sortBySuggestion(list) });
  });

  return groups;
}

/** Most-used first, then longest name — the fuller name is usually the real one. */
function sortBySuggestion(list) {
  return [...list].sort(
    (a, b) => b.itemCount - a.itemCount || String(b.name).length - String(a.name).length,
  );
}

/**
 * What merging a group would actually do. Nothing is written here — this is
 * shown before anything happens, the way imports are.
 */
export function buildMergePlan(group, keeperId, items = []) {
  const keeper = group.bags.find((b) => b.id === keeperId) || group.bags[0];
  const losers = group.bags.filter((b) => b.id !== keeper.id);

  const moves = losers.map((b) => ({
    from: b.name,
    id: b.id,
    itemCount: countItems(items, b.name),
  }));

  return {
    keeper,
    losers,
    moves,
    itemsMoved: moves.reduce((n, m) => n + m.itemCount, 0),
    bagsRemoved: losers.length,
  };
}

/**
 * The existing bag a loose reference means, or null if it is genuinely new.
 *
 * An imported sheet saying "Scree 32" means the "Jen (Scree 32)" already in
 * the app, not a new bag beside it. Normalized equality first, then one name
 * sitting inside the other.
 */
export function resolveBagName(name, existingBags = []) {
  const n = normalizeBagName(name);
  if (!n) return null;

  const exact = existingBags.find((b) => normalizeBagName(b.name) === n);
  if (exact) return exact.name;

  const contained = existingBags.find(
    (b) => nameContains(b.name, name) || nameContains(name, b.name),
  );
  return contained ? contained.name : null;
}

/**
 * Whether a name a user is about to save collides with a bag that already
 * exists. `selfId` excludes the bag being renamed.
 */
export function nameCollision(name, bags = [], selfId = null) {
  const others = bags.filter((b) => b.id !== selfId);
  const exact = others.find((b) => sameBagName(b.name, name));
  if (exact) return { kind: 'exact', bag: exact };
  const similar = others.find((b) => nameContains(b.name, name) || nameContains(name, b.name));
  if (similar) return { kind: 'similar', bag: similar };
  return null;
}
