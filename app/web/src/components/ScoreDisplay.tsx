import type { ScoreBreakdown } from '@bookbingo/lib-types';
import { Tooltip } from './ui/Tooltip.js';

interface ScoreDisplayProps {
  breakdown: ScoreBreakdown;
}

function InfoIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
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
  const { score, varietyPoints, volumePoints, balanceFactor, totalBooks } =
    breakdown;

  return (
    <div className="bg-surface-container-lowest rounded-lg shadow-sm border border-outline-variant overflow-hidden">
      <div className="bg-primary-container px-6 py-4 border-b border-outline-variant">
        <div className="flex justify-between items-baseline">
          <h3 className="text-label-caps uppercase text-on-primary-container">
            Bingo Score
          </h3>
          <div className="font-display text-4xl font-bold text-primary">
            {score.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-outline-variant">
        <div className="px-6 py-4">
          <div className="text-label-caps uppercase text-on-surface-variant mb-1">
            Books Read
          </div>
          <div className="text-xl font-semibold text-on-surface">
            {totalBooks}
          </div>
        </div>

        <div className="px-6 py-4">
          <div className="flex items-center gap-1 text-label-caps uppercase text-on-surface-variant mb-1">
            Variety Points
            <Tooltip content="1 point for each unique category covered. Spread your reading for more points.">
              <button
                type="button"
                className="inline-flex text-on-surface-variant hover:text-on-surface focus:outline-none focus:text-on-surface"
                aria-label="About variety points"
              >
                <InfoIcon />
              </button>
            </Tooltip>
          </div>
          <div className="text-xl font-semibold text-on-surface">
            {varietyPoints}
          </div>
        </div>

        <div className="px-6 py-4">
          <div className="flex items-center gap-1 text-label-caps uppercase text-on-surface-variant mb-1">
            Volume Points
            <Tooltip content="Bonus for repeat books in a category, with diminishing returns.">
              <button
                type="button"
                className="inline-flex text-on-surface-variant hover:text-on-surface focus:outline-none focus:text-on-surface"
                aria-label="About volume points"
              >
                <InfoIcon />
              </button>
            </Tooltip>
          </div>
          <div className="text-xl font-semibold text-on-surface">
            {volumePoints.toFixed(2)}
          </div>
        </div>

        <div className="px-6 py-4">
          <div className="flex items-center gap-1 text-label-caps uppercase text-on-surface-variant mb-1">
            Balance Factor
            <Tooltip content="Scales volume points based on how evenly books are spread. Higher is better.">
              <button
                type="button"
                className="inline-flex text-on-surface-variant hover:text-on-surface focus:outline-none focus:text-on-surface"
                aria-label="About balance factor"
              >
                <InfoIcon />
              </button>
            </Tooltip>
          </div>
          <div className="text-xl font-semibold text-on-surface">
            x{balanceFactor.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}
