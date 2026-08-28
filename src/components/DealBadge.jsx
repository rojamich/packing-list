import { dealVerdict, VERDICT_CLASSES } from '../lib/money';

/**
 * "Is this a good deal?" in one chip. Renders nothing when there's no target
 * price to judge against — a verdict with no baseline is worse than silence.
 */
export default function DealBadge({ priceUSD, targetUSD, waitUSD, size = 'sm' }) {
  const verdict = dealVerdict(priceUSD, targetUSD, waitUSD);
  if (!verdict) return null;

  const pad = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  return (
    <span className={`inline-flex flex-shrink-0 rounded-full font-semibold ${pad} ${VERDICT_CLASSES[verdict.tone]}`}>
      {verdict.label}
    </span>
  );
}
