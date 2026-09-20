const STEPS = ["About you", "Education", "Goals", "Preferences"];

export default function Progress({ current }: { current: number }) {
  return (
    <div>
      <div className="flex gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i <= current ? "bg-gray-900" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
      <div className="mt-2.5 hidden items-center justify-between sm:flex">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
              i === current ? "text-gray-900" : i < current ? "text-gray-500" : "text-gray-300"
            }`}
          >
            {String(i + 1).padStart(2, "0")} · {s}
          </span>
        ))}
      </div>
    </div>
  );
}