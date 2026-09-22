export function Field({
  label,
  hint,
  error,
  required,
  id,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-gray-700">
          {label}
          {required && <span className="ml-1 text-gray-400">*</span>}
        </label>
        {error && <span className="text-xs font-medium text-red-600" id={id ? `${id}-error` : undefined}>{error}</span>}
      </div>
      {children}
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export const inputClass =
  'w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-all focus:border-primary focus:ring-[3px] focus:ring-primary/15 disabled:bg-gray-50 disabled:text-gray-500';