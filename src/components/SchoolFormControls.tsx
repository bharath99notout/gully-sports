'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  badge?: string;
  tone?: 'blue' | 'pink' | 'emerald';
};

export function SegmentedChoice<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: ChoiceOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="grid gap-1 rounded-xl border border-gray-800 bg-gray-950 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      aria-label={ariaLabel}
    >
      {options.map(option => {
        const selected = option.value === value;
        const selectedClass = option.tone === 'blue'
          ? 'bg-sky-600 text-white shadow-sm'
          : option.tone === 'pink'
            ? 'bg-fuchsia-600 text-white shadow-sm'
            : 'bg-emerald-600 text-white shadow-sm';
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`min-h-10 rounded-lg px-2 text-xs font-semibold transition-colors ${
              selected
                ? selectedClass
                : 'text-gray-400 hover:bg-gray-900 hover:text-white'
            }`}
            aria-pressed={selected}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function DarkListbox<T extends string>({
  value,
  options,
  onChange,
  placeholder,
  emptyText = 'No options available',
  searchable = false,
  searchPlaceholder = 'Search...',
}: {
  value: T;
  options: ChoiceOption<T>[];
  onChange: (value: T) => void;
  placeholder: string;
  emptyText?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find(option => option.value === value);

  const visibleOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter(option =>
      [option.label, option.description, option.badge]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  function pick(nextValue: T) {
    onChange(nextValue);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-left text-sm text-white transition-colors hover:border-gray-700 focus:border-emerald-700 focus:outline-none"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className={`block truncate ${selected ? 'text-white' : 'text-gray-500'}`}>
            {selected?.label ?? placeholder}
          </span>
          {selected?.description && (
            <span className="mt-0.5 block truncate text-xs text-gray-500">{selected.description}</span>
          )}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-gray-700 bg-gray-950 shadow-2xl">
          {searchable && (
            <div className="flex items-center gap-2 border-b border-gray-800 bg-gray-900 px-3 py-2">
              <Search size={14} className="text-gray-500" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none"
                autoFocus
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto p-1" role="listbox">
            {visibleOptions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-500">{emptyText}</p>
            ) : (
              visibleOptions.map(option => {
                const selectedOption = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => pick(option.value)}
                    className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                      selectedOption
                        ? 'bg-emerald-950/60 text-emerald-200'
                        : 'text-gray-300 hover:bg-gray-900 hover:text-white'
                    }`}
                    role="option"
                    aria-selected={selectedOption}
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                      {selectedOption && <Check size={14} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{option.label}</span>
                      {option.description && (
                        <span className="mt-0.5 block truncate text-xs text-gray-500">{option.description}</span>
                      )}
                    </span>
                    {option.badge && (
                      <span className="shrink-0 rounded-full border border-gray-700 px-2 py-0.5 text-[11px] text-gray-400">
                        {option.badge}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
