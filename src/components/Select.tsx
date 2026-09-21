"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Monochrome, accessible single-select dropdown matching the app's form style
 * (rounded-xl, gray-300 border, gray-900 focus ring). Native-select feel with a
 * custom panel so long program names wrap cleanly and the selected row shows a
 * check — while keeping keyboard + outside-click behaviour.
 */
export default function Select({
  value,
  onChange,
  options,
  placeholder = "Select an option",
  disabled = false,
  ariaLabel,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const selectedIndex = useMemo(
    () => options.findIndex((o) => o.value === value),
    [options, value],
  );
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelectorAll("[role='option']")[
      activeIndex
    ];
    node?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const openList = () => {
    if (disabled || options.length === 0) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const choose = (option: SelectOption) => {
    onChange(option.value);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Enter" ||
        e.key === " "
      ) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % options.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + options.length) % options.length);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (options[activeIndex]) choose(options[activeIndex]);
        break;
    }
  };

  const empty = options.length === 0;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleKeyDown}
        disabled={disabled || empty}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-left text-sm outline-none transition-colors focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
      >
        <span className={`truncate ${selected ? "text-gray-800" : "text-gray-400"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && !empty && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 z-30 mt-1.5 max-h-64 overflow-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-[0_18px_44px_-20px_rgba(0,0,0,0.35)]"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(option);
                }}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive ? "bg-gray-50" : ""
                } ${isSelected ? "font-semibold text-gray-900" : "text-gray-700"}`}
              >
                <span className="min-w-0 break-words">{option.label}</span>
                {isSelected && (
                  <Check className="h-4 w-4 shrink-0 text-gray-900" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
