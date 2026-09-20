"use client";

import { Check } from "lucide-react";

export interface ChipOption {
  value: string;
  label: string;
  description?: string;
}

interface ChipGroupProps {
  options: ChipOption[];
  values: string[];
  onChange: (values: string[]) => void;
  single?: boolean;
  variant?: "chip" | "card";
}

export default function ChipGroup({
  options,
  values,
  onChange,
  single = false,
  variant = "chip",
}: ChipGroupProps) {
  const toggle = (value: string) => {
    if (single) {
      onChange(values.includes(value) ? [] : [value]);
    } else {
      onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
    }
  };

  if (variant === "card") {
    return (
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => {
          const selected = values.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(o.value)}
              className={`relative rounded-xl border p-3.5 text-left transition-all duration-150 ${
                selected
                  ? "border-gray-900 bg-gray-900 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
                  : "border-gray-300 bg-white text-gray-700 hover:border-gray-900"
              }`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="pr-1">
                  <span className="block text-sm font-medium">{o.label}</span>
                  {o.description && (
                    <span className={`mt-0.5 block text-xs ${selected ? "text-gray-300" : "text-gray-500"}`}>
                      {o.description}
                    </span>
                  )}
                </span>
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    selected ? "border-white bg-white text-gray-900" : "border-gray-300 text-transparent"
                  }`}
                >
                  <Check className="h-3 w-3" />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const selected = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={selected}
            onClick={() => toggle(o.value)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-all duration-150 ${
              selected
                ? "border-gray-900 bg-gray-900 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
                : "border-gray-300 bg-white text-gray-600 hover:border-gray-900 hover:text-gray-900"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}