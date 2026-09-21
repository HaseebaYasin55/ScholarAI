"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, LogOut, UserRound, Settings2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Scholarships", href: "/scholarships" },
  { label: "My Applications", href: "/applications" },
  { label: "SOP Generator", href: "/sop-generator" },
  { label: "Profile", href: "/profile" },
];

function getInitials(user: {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
}): string {
  const first = (user.first_name || "").trim();
  const last = (user.last_name || "").trim();
  if (first || last)
    return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase() || "?";
  const full = (user.full_name || "").trim();
  if (full)
    return full
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase();
  return (user.email?.[0] || "S").toUpperCase();
}

export default function Header() {
  const { user, signOut } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName = user?.full_name || user?.email || "Student";
  const initials = getInitials(user ?? {});

  const isActive = (href: string) =>
    href === "/scholarships"
      ? pathname.startsWith(href)
      : pathname === href;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleSignOut = async () => {
    setOpen(false);
    try {
      await signOut();
    } catch {
      /* ignore */
    }
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-6 px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-5">
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-2.5"
            title="ScholarAI"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-[12px] font-bold tracking-tight text-white">
              S
            </span>
            <span className="hidden text-[15px] font-bold tracking-tight text-gray-900 sm:block">
              ScholarAI
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={
                  isActive(item.href)
                    ? "rounded-lg bg-gray-900 px-3 py-1.5 text-[13px] font-semibold text-white transition-colors"
                    : "rounded-lg px-3 py-1.5 text-[13px] font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center">
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-2 py-1.5 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            >
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={displayName}
                  className="h-8 w-8 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-xs font-semibold text-white">
                  {initials}
                </span>
              )}
              <span className="hidden max-w-[120px] truncate text-sm font-medium text-gray-700 sm:block">
                {displayName}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>

            {open && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-52 rounded-xl border border-gray-200 bg-white p-1.5 shadow-[0_18px_44px_-20px_rgba(0,0,0,0.35)]"
              >
                <Link
                  href="/profile"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
                >
                  <UserRound className="h-4 w-4 text-gray-400" />
                  Profile
                </Link>
                <Link
                  href="/profile?edit=1"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
                >
                  <Settings2 className="h-4 w-4 text-gray-400" />
                  Edit Profile
                </Link>
                <div className="my-1 h-px bg-gray-100" />
                <button
                  onClick={handleSignOut}
                  role="menuitem"
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
                >
                  <LogOut className="h-4 w-4 text-gray-400" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}