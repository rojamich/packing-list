export function grams(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function formatWeight(value) {
  const total = grams(value);
  if (total >= 1000) {
    const kilograms = total / 1000;
    return `${(kilograms >= 10 ? kilograms.toFixed(1) : kilograms.toFixed(2)).replace(/\.?0+$/, '')} kg`;
  }
  return `${Math.round(total)} g`;
}

/** Weight of a bag's direct contents. Nested bags remain separate carry units. */
export function bagWeight(bagName, items = []) {
  return items
    .filter((item) => item.inBag === bagName)
    .reduce((total, item) => total + grams(item.weightGrams) * Math.max(1, Number(item.qty) || 1), 0);
}
