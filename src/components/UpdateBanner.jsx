import { Download } from 'lucide-react';

/** Shown when the server is serving a newer build than the one running. */
export default function UpdateBanner({ onApply }) {
  return (
    <div className="sticky top-0 z-40 bg-blue-600 text-white px-4 py-2.5 flex items-center gap-3 shadow-md">
      <Download size={16} className="flex-shrink-0" />
      <span className="flex-1 text-sm font-medium">A newer version is available.</span>
      <button
        onClick={onApply}
        className="flex-shrink-0 bg-white text-blue-700 text-sm font-semibold px-3 py-1 rounded-lg active:bg-blue-50"
      >
        Reload
      </button>
    </div>
  );
}
