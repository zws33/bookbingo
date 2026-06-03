import type { ScoreBreakdown } from '@bookbingo/lib-types';
import { Tooltip } from './ui/Tooltip.js';

interface ScoreDisplayProps {
  breakdown: ScoreBreakdown;
}

function InfoIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

export function ScoreDisplay({ breakdown }: ScoreDisplayProps) {
  const { score, varietyPoints, volumePoints, balanceFactor, totalBooks } = breakdown;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-blue-50 px-6 py-4 border-b border-gray-200">
        <div className="flex justify-between items-baseline">
          <h3 className="text-sm font-medium text-blue-900 uppercase tracking-wider">
            Bingo Score
          </h3>
          <div className="text-3xl font-bold text-blue-600">{score.toFixed(2)}</div>
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
            <Tooltip content="1 point for each unique category covered. Spread your reading for more points.">
              <button
                type="button"
                className="inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:text-gray-500"
                aria-label="About variety points"
              >
                <InfoIcon />
              </button>
            </Tooltip>
          </div>
          <div className="text-xl font-semibold text-gray-900">{varietyPoints}</div>
        </div>

        <div className="px-6 py-4">
          <div className="flex items-center gap-1 text-sm text-gray-500 mb-1">
            Volume Points
            <Tooltip content="Bonus for repeat books in a category, with diminishing returns.">
              <button
                type="button"
                className="inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:text-gray-500"
                aria-label="About volume points"
              >
                <InfoIcon />
              </button>
            </Tooltip>
          </div>
          <div className="text-xl font-semibold text-gray-900">{volumePoints.toFixed(2)}</div>
        </div>

        <div className="px-6 py-4">
          <div className="flex items-center gap-1 text-sm text-gray-500 mb-1">
            Balance Factor
            <Tooltip content="Scales volume points based on how evenly books are spread. Higher is better.">
              <button
                type="button"
                className="inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:text-gray-500"
                aria-label="About balance factor"
              >
                <InfoIcon />
              </button>
            </Tooltip>
          </div>
          <div className="text-xl font-semibold text-gray-900">x{balanceFactor.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}
