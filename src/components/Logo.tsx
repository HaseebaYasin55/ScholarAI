import { GraduationCap } from "lucide-react";

export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white">
        <GraduationCap className="h-4.5 w-4.5" />
      </span>
      {!compact && (
        <span className="text-lg font-semibold tracking-tight text-gray-900">
          ScholarAI
        </span>
      )}
    </div>
  );
}