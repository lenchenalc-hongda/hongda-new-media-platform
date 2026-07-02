'use client';

interface FilterOption {
  value: string;
  label: string;
}

interface FilterBarProps {
  filters: { key: string; label: string; options: FilterOption[] }[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
}

export default function FilterBar({ filters, values, onChange, searchPlaceholder, searchValue, onSearchChange }: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-3 items-center mb-4">
      {onSearchChange && (
        <input
          type="text"
          placeholder={searchPlaceholder || '搜索...'}
          value={searchValue || ''}
          onChange={(e) => onSearchChange(e.target.value)}
          className="input-field w-48"
        />
      )}
      {filters.map((filter) => (
        <select
          key={filter.key}
          value={values[filter.key] || ''}
          onChange={(e) => onChange(filter.key, e.target.value)}
          className="select-field w-auto min-w-[120px]"
        >
          <option value="">{filter.label}</option>
          {filter.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ))}
    </div>
  );
}
