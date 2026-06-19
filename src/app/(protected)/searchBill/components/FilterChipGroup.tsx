"use client";

interface FilterChipGroupProps {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  variant?: "default" | "secondary";
  labelsMap?: Record<string, string>;
}

const variantStyles = {
  default: {
    active: "bg-blue-600 text-white",
    inactive: "bg-slate-100 text-slate-600 hover:bg-slate-200",
  },
  secondary: {
    active: "bg-emerald-600 text-white",
    inactive: "bg-slate-100 text-slate-600 hover:bg-slate-200",
  },
};

export default function FilterChipGroup({
  label,
  options,
  selected,
  onToggle,
  variant = "default",
  labelsMap = {},
}: FilterChipGroupProps) {
  const styles = variantStyles[variant];

  return (
    <div>
      <label className="text-xs font-medium text-slate-600 mb-2 block">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onToggle(option)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              selected.includes(option) ? styles.active : styles.inactive
            }`}
          >
            {labelsMap[option] || option}
          </button>
        ))}
      </div>
    </div>
  );
}