import type { ScoreBreakdown } from '@bookbingo/lib-types';

interface ScoreDisplayProps {
  breakdown: ScoreBreakdown;
}

export function ScoreDisplay({ breakdown }: ScoreDisplayProps) {
  const { score, varietyPoints, volumePoints, balanceFactor, totalBooks } = breakdown;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-blue-50 px-6 py-4 border-b border-gray-200">
        <div className="flex justify-between items-baseline">
          <h3 className="text-sm font-medium text-blue-900 uppercase tracking-wider">
            Bingo Score
          </h3>
          <div className="text-3xl font-bold text-blue-600">
            {score.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-gray-200">
        <div className="px-6 py-4">
          <div className="text-sm text-gray-500 mb-1">Books Read</div>
          <div className="text-xl font-semibold text-gray-900">{totalBooks}</div>
        </div>

        <div className="px-6 py-4">
          <div className="flex items-center gap-1 text-sm text-gray-500 mb-1">
            Variety Points
            <span className="cursor-help group relative">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-10">
                1 point for each unique category covered. Spread your reading for more points.
              </div>
            </span>
          </div>
          <div className="text-xl font-semibold text-gray-900">{varietyPoints}</div>
        </div>

        <div className="px-6 py-4">
          <div className="flex items-center gap-1 text-sm text-gray-500 mb-1">
            Volume Points
            <span className="cursor-help group relative">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-10">
                Bonus for repeat books in a category, with diminishing returns.
              </div>
            </span>
          </div>
          <div className="text-xl font-semibold text-gray-900">{volumePoints.toFixed(2)}</div>
        </div>

        <div className="px-6 py-4">
          <div className="flex items-center gap-1 text-sm text-gray-500 mb-1">
            Balance Factor
            <span className="cursor-help group relative">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-10">
                Scales volume points based on how evenly books are spread. Higher is better.
              </div>
            </span>
          </div>
          <div className="text-xl font-semibold text-gray-900">
            x{balanceFactor.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}
