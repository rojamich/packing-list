export const HYGIENE_CATEGORY = 'Hygiene';

export const DEFAULT_CATEGORIES = [
  'Clothing – Mike',
  'Clothing – Jen',
  'Electronics',
  HYGIENE_CATEGORY,
  'Health & Medical',
];

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

/** One tidy category list for pickers, including older records with no saved category document. */
export function categoryNames(categories = [], items = []) {
  const names = new Set(DEFAULT_CATEGORIES);
  categories.forEach((category) => {
    if (category?.name?.trim()) names.add(canonicalCategory(category.name.trim()));
  });
  items.forEach((item) => {
    const name = canonicalCategory(item?.category)?.trim();
    if (name) names.add(name);
  });
  return [...names].sort((a, b) => a.localeCompare(b));
}
