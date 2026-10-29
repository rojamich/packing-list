export const HYGIENE_CATEGORY = 'Hygiene';

// Keep existing lists tidy while their records are gradually saved with the
// shorter name. These are labels from earlier versions of the app.
export const LEGACY_HYGIENE_CATEGORIES = new Set([
  'Toiletries – Shared Bag',
  'Toiletries - Shared Bag',
  'Shared Hygiene Bag',
]);

export function canonicalCategory(category) {
  return LEGACY_HYGIENE_CATEGORIES.has(category) ? HYGIENE_CATEGORY : category;
}
