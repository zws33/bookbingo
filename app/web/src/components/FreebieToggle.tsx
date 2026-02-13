interface FreebieToggleProps {
  isFreebie: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

export function FreebieToggle({ isFreebie, onChange, disabled }: FreebieToggleProps) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={isFreebie}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
      />
      <span className="text-sm text-gray-900">Freebie (unlimited tiles)</span>
    </label>
  );
}