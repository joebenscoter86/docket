"use client";

import type { TrackingCategory, TrackingAssignment } from "@/lib/accounting/types";

interface TrackingCategorySelectProps {
  category: TrackingCategory;
  currentAssignment: TrackingAssignment | null;
  onSelect: (assignment: TrackingAssignment | null) => void;
  disabled?: boolean;
}

export default function TrackingCategorySelect({
  category,
  currentAssignment,
  onSelect,
  disabled = false,
}: TrackingCategorySelectProps) {
  const handleChange = (optionId: string) => {
    if (!optionId) {
      onSelect(null);
      return;
    }

    const option = category.options.find((o) => o.id === optionId);
    if (!option) return;

    onSelect({
      categoryId: category.id,
      categoryName: category.name,
      optionId: option.id,
      optionName: option.name,
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      <label className="text-xs text-muted whitespace-nowrap">
        {category.name}:
      </label>
      <div className="relative flex items-center">
        <select
          value={currentAssignment?.optionId ?? ""}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          className="text-xs border border-border rounded px-1.5 py-1 pr-6 bg-surface text-text focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#BFDBFE] focus:border-primary disabled:bg-background disabled:cursor-not-allowed appearance-none"
        >
          <option value="">--</option>
          {category.options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
            </option>
          ))}
        </select>
        <svg
          className="absolute right-1.5 h-3 w-3 text-muted pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
        {currentAssignment && !disabled && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="ml-1 text-muted hover:text-error"
            aria-label={`Clear ${category.name}`}
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
