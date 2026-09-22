"use client";

import Link from "next/link";
import { Fragment } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Calendar,
  Check,
  ClipboardList,
  Compass,
  Rocket,
  Search,
  Sparkles,
} from "lucide-react";
import Logo from "@/components/Logo";
import { LogoMark } from "@/components/Logo";

const STRIP = ["Scholarships", "Documents", "SOPs", "Deadlines", "Eligibility"];

/* ── Shared card chrome ──────────────────────────────────────────────────── */

function CardSurface({
  accent = "primary",
  index,
  label,
  icon,
  children,
  className = "",
  delay = "0ms",
}: {
  accent?: "primary" | "ink";
  index: string;
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  delay?: string;
}) {
  return (
    <div className="rise-in relative flex items-stretch gap-3 sm:gap-7" style={{ animationDelay: delay }}>
      {/* Rail stamp */}
      <div className="relative flex w-9 shrink-0 justify-center sm:w-11">
        <span
          aria-hidden="true"
          className="absolute top-1 left-1/2 h-10 w-10 -translate-x-1/2 rounded-full border border-dashed border-gray-300 sm:h-11 sm:w-11"
        />
        <span
          className={`group-stamp z-10 mt-1.5 flex h-7 w-7 items-center justify-center rounded-full font-mono text-[10px] font-bold transition-all duration-300 ${
            accent === "primary"
              ? "bg-primary text-white shadow-[0_1px_2px_rgba(62,110,146,0.4),0_8px_14px_-8px_rgba(82,137,173,0.7)]"
              : "bg-gray-900 text-white shadow-[0_1px_2px_rgba(36,60,76,0.4),0_8px_14px_-8px_rgba(36,60,76,0.6)]"
          }`}
        >
          {index}
        </span>
      </div>

      {/* Card */}
      <article
        className={`group relative w-full rounded-2xl border border-gray-200 bg-white shadow-card transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-card-hover ${className}`}
      >
        {/* layered accent edge */}
        <span
          aria-hidden="true"
          className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-60 rounded-t-2xl opacity-80 transition-transform duration-500 ease-out group-hover:scale-x-100 ${
            accent === "primary" ? "bg-primary" : "bg-gray-900"
          }`}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent"
        />

        <div className="p-5 sm:p-6">
          {/* Head */}
          <div className="flex items-center gap-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-chip transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105 ${
                accent === "primary"
                  ? "bg-primary-tint text-primary-ink"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {icon}
            </span>
            <div className="min-w-0">
              <p className="eyebrow">{label}</p>
              <p className="truncate text-[15px] font-bold tracking-tight text-gray-900">
                Step {index}
              </p>
            </div>
            <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-gray-300 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>

          <div className="mt-5">{children}</div>
        </div>
      </article>
    </div>
  );
}

function MiniBar({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-gray-700 shadow-chip ring-1 ring-gray-200/70 transition-colors duration-300 group-hover:text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-gray-800">
          {title}
        </p>
        <p className="truncate text-[11px] text-gray-400">{sub}</p>
      </div>
    </div>
  );
}

function CheckedRow({
  label,
  state,
}: {
  label: string;
  state: "done" | "current" | "todo";
}) {
  return (
    <li className="flex items-center gap-2.5 py-2 text-[13px] text-gray-700">
      {state === "todo" ? (
        <span className="relative mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-gray-200">
          <span className="absolute inset-1 rounded-full bg-primary opacity-0 transition-opacity duration-300 group-hover:opacity-40" />
        </span>
      ) : (
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-110 ${
            state === "done" ? "bg-primary text-white" : "bg-gray-900 text-white"
          }`}
        >
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      )}
      <span className="truncate">{label}</span>
      <span className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-gray-400">
        {state === "done" ? "Confirmed" : state === "current" ? "In progress" : "Pending"}
      </span>
    </li>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface text-gray-900">
      {/* Top nav */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-surface/95">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Logo />
          <nav aria-label="Account" className="flex items-center gap-2">
            <Link
              href="/auth?mode=login"
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700 shadow-chip transition-all duration-150 hover:-translate-y-px hover:border-gray-900 hover:text-gray-900 hover:shadow-chip-hover focus-visible:outline-primary"
            >
              Log in
            </Link>
            <Link
              href="/auth?mode=signup"
              className="hidden items-center gap-1.5 rounded-lg bg-primary-deep px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(36,60,76,0.3),0_8px_16px_-10px_rgba(62,110,146,0.6)] transition-all duration-150 hover:-translate-y-px hover:bg-primary-ink hover:shadow-[0_1px_2px_rgba(36,60,76,0.3),0_12px_22px_-10px_rgba(62,110,146,0.55)] sm:inline-flex"
            >
              Sign up free
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <section className="relative mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-14 lg:py-28">
          {/* ambient tint */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 right-0 h-[26rem] w-[26rem] rounded-full bg-primary/10 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-gray-200/40 blur-3xl"
          />

          {/* Copy */}
          <div className="relative">
            <p className="rise-in flex items-center gap-3 font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-gray-500">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_0_3px_rgba(82,137,173,0.18)]"
              />
              ScholarAI · Study abroad copilot
            </p>
            <h1
              className="rise-in mt-6 max-w-xl text-[clamp(2.4rem,1.35rem+4.5vw,4.1rem)] font-semibold leading-[1.04] tracking-[-0.02em] text-gray-900"
              style={{ animationDelay: "70ms" }}
            >
              Your journey to studying abroad, organized in{" "}
              <span className="relative inline-block whitespace-nowrap">
                <span
                  aria-hidden="true"
                  className="absolute -left-1 -right-1 bottom-[0.06em] h-[0.28em] -rotate-1 rounded-md bg-primary/20"
                />
                <span className="relative text-primary-ink">one place.</span>
              </span>
            </h1>
            <p
              className="rise-in mt-6 max-w-xl text-base leading-relaxed text-gray-500 sm:text-lg"
              style={{ animationDelay: "140ms" }}
            >
              Scholarships, documents, SOPs, deadlines and eligibility — one calm
              copilot for your whole application journey.
            </p>

            <div className="rise-in mt-10" style={{ animationDelay: "210ms" }}>
              {/* 3D Get Started */}
              <Link
                href="/auth?mode=signup"
                aria-label="Get started with ScholarAI"
                className="group relative inline-flex rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                <span
                  aria-hidden="true"
                  className="absolute -inset-x-2 -bottom-2 rounded-[1.6rem] bg-primary/25 blur-lg transition-all duration-300 group-hover:-bottom-3 group-active:-bottom-1"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 translate-y-[6px] rounded-2xl bg-primary-ink transition-transform duration-200 ease-out group-hover:translate-y-[8px] group-active:translate-y-[2px]"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 translate-y-[2px] rounded-2xl bg-primary-deep transition-transform duration-200 ease-out group-hover:translate-y-[3px] group-active:translate-y-0"
                />
                <span className="relative inline-flex items-center gap-2.5 rounded-2xl bg-primary px-9 py-4 text-base font-semibold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-10px_18px_-14px_rgba(36,60,76,0.6)] ring-1 ring-primary-ink/50 transition-all duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-10px_18px_-14px_rgba(36,60,76,0.6),0_16px_28px_-12px_rgba(62,110,146,0.55)] group-active:translate-y-[4px] group-active:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-8px_14px_-12px_rgba(36,60,76,0.6)]">
                  Get Started
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </Link>

              <p className="mt-5 text-sm text-gray-500">
                Already have an account?{" "}
                <Link
                  href="/auth?mode=login"
                  className="font-medium text-primary-ink underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary"
                >
                  Log in
                </Link>
              </p>
            </div>

            {/* Feature strip */}
            <div
              className="rise-in mt-12 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-gray-500"
              style={{ animationDelay: "280ms" }}
            >
              {STRIP.map((item, i) => (
                <Fragment key={item}>
                  {i > 0 && (
                    <span aria-hidden="true" className="text-gray-300">
                      /
                    </span>
                  )}
                  <span>{item}</span>
                </Fragment>
              ))}
            </div>
          </div>

          {/* Workflow — three connected journey cards */}
          <div
            aria-label="Your ScholarAI journey"
            className="relative flex flex-col gap-7 sm:gap-8 lg:pl-3"
          >
            {/* faint dot grid */}
            <div className="absolute -inset-6 overflow-hidden lg:-inset-10">
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[radial-gradient(rgba(36,60,76,0.045)_1px,transparent_1px)] bg-[size:22px_22px]"
              />
            </div>

            {/* journey rail */}
            <div
              aria-hidden="true"
              className="absolute bottom-10 top-6 left-[20px] w-px bg-gradient-to-b from-primary/40 via-gray-200 to-gray-200 sm:left-[20px]"
            />

            {/* 01 · Discover Scholarships */}
            <CardSurface
              index="01"
              label="Discover Scholarships"
              icon={<Compass className="h-4 w-4" />}
              delay="320ms"
              className="sm:max-w-[92%] sm:ml-6"
            >
              <div className="relative">
                <MiniBar
                  icon={<Search className="h-4 w-4" />}
                  title="Verified from official sources"
                  sub="Matched to your profile"
                />
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-medium text-white">
                    Country
                  </span>
                  <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-medium text-primary-ink">
                    Degree
                  </span>
                  <span className="rounded-full border border-gray-200 px-2.5 py-0.5 text-[10px] font-medium text-gray-400">
                    Field
                  </span>
                  <span className="rounded-full border border-gray-200 px-2.5 py-0.5 text-[10px] font-medium text-gray-400">
                    Funding
                  </span>
                  <span className="ml-auto hidden items-center gap-1 font-mono text-[9px] uppercase tracking-[0.16em] text-gray-400 sm:inline-flex">
                    Live search
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  </span>
                </div>
              </div>
            </CardSurface>

            {/* 02 · Build Application */}
            <CardSurface
              index="02"
              label="Build Application"
              icon={<Rocket className="h-4 w-4" />}
              delay="420ms"
              accent="ink"
              className="sm:max-w-[92%] sm:ml-8"
            >
              <div className="relative">
                <ul className="divide-y divide-gray-100">
                  <CheckedRow label="Choose your program" state="done" />
                  <CheckedRow label="Review requirements" state="done" />
                  <CheckedRow label="Start preparation" state="current" />
                </ul>

                {/* Documents & SOP — layered panel */}
                <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 shadow-[inset_0_1px_2px_rgba(36,60,76,0.03)]">
                  <p className="px-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Documents &amp; SOP
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    <li className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-[12px] text-gray-700 ring-1 ring-gray-200/70">
                      <Check className="h-3 w-3 text-primary" strokeWidth={3} />
                      <span className="truncate">CV / Resume</span>
                      <span className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-gray-400">
                        Uploaded
                      </span>
                    </li>
                    <li className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-[12px] text-gray-700 ring-1 ring-gray-200/70">
                      <Check className="h-3 w-3 text-primary" strokeWidth={3} />
                      <span className="truncate">Transcript</span>
                      <span className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-gray-400">
                        Uploaded
                      </span>
                    </li>
                    <li className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-[12px] text-gray-700 ring-1 ring-gray-200/70">
                      <Sparkles className="h-3 w-3 text-primary" />
                      <span className="truncate">Statement of Purpose</span>
                      <span className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-primary-ink">
                        Drafted
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 font-mono text-[9px] uppercase tracking-[0.18em] text-gray-400">
                  <span>Readiness</span>
                  <span className="inline-flex items-center gap-1.5 text-gray-600">
                    3 of 3 ready
                    <ArrowRight className="h-3 w-3 text-primary transition-transform duration-300 group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </CardSurface>

            {/* 03 · Track & Submit */}
            <CardSurface
              index="03"
              label="Track &amp; Submit"
              icon={<ClipboardList className="h-4 w-4" />}
              delay="520ms"
              className="sm:max-w-[92%] sm:ml-4"
            >
              <div className="relative">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <MiniBar
                    icon={<ClipboardList className="h-4 w-4" />}
                    title="Every application, one tracker"
                    sub="Status · documents · deadlines"
                  />
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-900 px-2.5 py-1 text-[11px] font-medium text-white shadow-[0_1px_2px_rgba(36,60,76,0.3),0_8px_14px_-10px_rgba(36,60,76,0.6)]">
                    <Calendar className="h-3 w-3" />
                    Due in 9 days
                  </span>
                </div>

                <div className="mt-4 border-t border-gray-100 pt-3">
                  <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-gray-400">
                    <span>Progress</span>
                    <span className="inline-flex items-center gap-1.5 text-primary-ink">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      Ready to submit
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full w-full origin-left scale-x-100 rounded-full bg-gradient-to-r from-primary to-primary-deep transition-transform duration-700 ease-out" />
                  </div>
                </div>
              </div>
            </CardSurface>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-9 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <LogoMark className="h-7 w-7 rounded-lg" />
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gray-500">
              ScholarAI · a study abroad copilot
            </p>
          </div>
          <p className="hidden font-mono text-[11px] uppercase tracking-[0.2em] text-gray-400 sm:block">
            One application at a time
          </p>
        </div>
      </footer>
    </div>
  );
}