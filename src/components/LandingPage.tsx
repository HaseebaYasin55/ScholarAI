"use client";

import Link from "next/link";
import { Fragment } from "react";
import { ArrowUpRight, Award, Calendar, Check, FileText } from "lucide-react";
import Logo from "@/components/Logo";

const STRIP = ["Scholarships", "Documents", "SOPs", "Deadlines", "Eligibility"];

function CardShell({
  variant = "strong",
  className = "",
  children,
}: {
  variant?: "soft" | "strong";
  className?: string;
  children: React.ReactNode;
}) {
  const rest =
    variant === "strong"
      ? "shadow-[0_1px_2px_rgba(0,0,0,0.05),0_22px_44px_-24px_rgba(0,0,0,0.4)]"
      : "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_24px_-18px_rgba(0,0,0,0.3)]";
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_1px_2px_rgba(0,0,0,0.05),0_28px_52px_-26px_rgba(0,0,0,0.42)] ${rest} ${className}`}
    >
      {children}
    </div>
  );
}

function Stamp({
  index,
  state,
}: {
  index: string;
  state: "outline" | "solid" | "destination";
}) {
  return (
    <div className="relative flex h-10 w-10 shrink-0 justify-center sm:h-11 sm:w-11">
      <span
        aria-hidden="true"
        className="absolute top-1 left-1/2 h-10 w-10 -translate-x-1/2 rounded-full border border-dashed border-gray-400/70 sm:top-1.5 sm:h-11 sm:w-11"
      />
      {state === "outline" && (
        <span className="relative mt-3 flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-gray-900 bg-white font-mono text-[10px] font-semibold text-gray-900 sm:h-7 sm:w-7">
          {index}
        </span>
      )}
      {state === "solid" && (
        <span className="relative mt-3 flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 font-mono text-[10px] font-semibold text-white sm:h-7 sm:w-7">
          {index}
        </span>
      )}
      {state === "destination" && (
        <span className="relative mt-3 flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 font-mono text-[10px] font-semibold text-white ring-4 ring-gray-100 sm:h-7 sm:w-7">
          {index}
        </span>
      )}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900">
      {/* Top nav */}
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Logo />
          <nav aria-label="Account">
            <Link
              href="/auth?mode=login"
              className="rounded-md px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
            >
              Log in
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl gap-16 px-6 py-16 lg:grid-cols-[1fr_1.02fr] lg:items-center lg:gap-16 lg:py-28">
          {/* Copy */}
          <div>
            <p className="rise-in flex items-center gap-3 font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-gray-500">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gray-900" />
              ScholarAI · Study abroad copilot
            </p>
            <h1 className="rise-in mt-6 max-w-xl text-[clamp(2.5rem,1.4rem+4.5vw,4.25rem)] font-semibold leading-[1.04] tracking-[-0.02em] text-gray-900" style={{ animationDelay: "70ms" }}>
              Your journey to studying abroad, organized in{" "}
              <span className="relative inline-block whitespace-nowrap">
                <span
                  aria-hidden="true"
                  className="absolute -left-1 -right-1 bottom-[0.04em] h-[0.26em] -rotate-1 rounded-[3px] bg-gray-200"
                />
                <span className="relative">one place.</span>
              </span>
            </h1>
            <p
              className="rise-in mt-6 max-w-xl text-base leading-relaxed text-gray-600 sm:text-lg"
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
                className="group relative inline-flex rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gray-900"
              >
                <span
                  aria-hidden="true"
                  className="absolute -inset-x-2 -bottom-2 rounded-[1.6rem] bg-gray-900/10 blur-lg transition-all duration-300 group-hover:-bottom-3 group-active:-bottom-1"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 translate-y-[6px] rounded-2xl bg-gray-800 transition-transform duration-200 ease-out group-hover:translate-y-[8px] group-active:translate-y-[2px]"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 translate-y-[2px] rounded-2xl bg-gray-950 transition-transform duration-200 ease-out group-hover:translate-y-[3px] group-active:translate-y-0"
                />
                <span className="relative inline-flex items-center gap-2.5 rounded-2xl bg-gray-900 px-9 py-4 text-base font-semibold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-10px_18px_-14px_rgba(0,0,0,0.6)] ring-1 ring-black/40 transition-all duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-10px_18px_-14px_rgba(0,0,0,0.6),0_16px_28px_-12px_rgba(0,0,0,0.5)] group-active:translate-y-[4px] group-active:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-8px_14px_-12px_rgba(0,0,0,0.6)]">
                  Get Started
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </Link>

              <p className="mt-5 text-sm text-gray-500">
                Already have an account?{" "}
                <Link
                  href="/auth?mode=login"
                  className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 transition-colors hover:decoration-gray-900"
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

          {/* Visual composition */}
          <div
            aria-hidden="true"
            className="relative flex flex-col gap-7 sm:gap-9 lg:pl-2"
          >
            {/* faint dot grid backdrop */}
            <div className="absolute -inset-4 overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(rgba(0,0,0,0.04)_1px,transparent_1px)] bg-[size:20px_20px]" />
            </div>

            {/* journey rail */}
            <div
              aria-hidden="true"
              className="absolute bottom-6 top-6 left-[19px] w-px bg-gray-200 sm:left-[23px]"
            />

            {/* 01 · Discover */}
            <div
              className="rise-in relative flex items-start gap-5 sm:gap-7"
              style={{ animationDelay: "320ms" }}
            >
              <Stamp index="01" state="outline" />
              <div className="min-w-0 flex-1 -rotate-1 sm:max-w-[82%] sm:-mr-5">
                <CardShell variant="soft">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-400">
                    Find funding
                  </p>
                  <div className="mt-4 flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-900 text-white">
                      <Award className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-800">
                        Rhodes Scholarship
                      </p>
                      <p className="truncate text-[11px] text-gray-400">
                        Matched to your profile
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-medium text-white">
                      Field
                    </span>
                    <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-medium text-white">
                      Degree
                    </span>
                    <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                      GPA
                    </span>
                    <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                      Language
                    </span>
                  </div>
                </CardShell>
              </div>
            </div>

            {/* 02 · Prepare */}
            <div
              className="rise-in relative flex items-start gap-5 sm:gap-7"
              style={{ animationDelay: "420ms" }}
            >
              <Stamp index="02" state="solid" />
              <div className="min-w-0 flex-1">
                <CardShell>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-400">
                    Build your application
                  </p>
                  <ul className="mt-4 divide-y divide-gray-100">
                    <li className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 text-sm text-gray-700">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white">
                        <Check className="h-3 w-3" />
                      </span>
                      <span className="truncate">Statement of Purpose</span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-gray-400">
                        Drafted
                      </span>
                    </li>
                    <li className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 text-sm text-gray-700">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white">
                        <Check className="h-3 w-3" />
                      </span>
                      <span className="truncate">Transcripts</span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-gray-400">
                        Uploaded
                      </span>
                    </li>
                    <li className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 text-sm text-gray-700">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                      <span className="truncate">Recommendations</span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-gray-400">
                        2 of 3
                      </span>
                    </li>
                  </ul>
                  <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-gray-400">
                    <span>Status</span>
                    <span className="text-gray-600">2 of 3 ready</span>
                  </div>
                </CardShell>
              </div>
            </div>

            {/* 03 · Apply */}
            <div
              className="rise-in relative flex items-start gap-5 sm:gap-7"
              style={{ animationDelay: "520ms" }}
            >
              <Stamp index="03" state="destination" />
              <div className="min-w-0 flex-1 rotate-1 sm:max-w-[82%] sm:ml-5">
                <CardShell variant="soft">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-400">
                    Track &amp; submit
                  </p>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-800">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-800">
                          MSc Public Policy
                        </p>
                        <p className="truncate text-[11px] text-gray-400">
                          LMU Munich
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-900 px-2.5 py-1 text-[11px] font-medium text-white">
                      <Calendar className="h-3 w-3" />
                      Due in 9 days
                    </span>
                  </div>
                  <div className="mt-4 border-t border-gray-100 pt-3">
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-gray-400">
                      <span>Progress</span>
                      <span className="text-gray-600">3 of 4</span>
                    </div>
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full w-[75%] rounded-full bg-gray-900" />
                    </div>
                  </div>
                </CardShell>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-100">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 font-mono text-[11px] uppercase tracking-[0.2em] text-gray-400 sm:flex-row">
          <p>ScholarAI · a study abroad copilot</p>
          <p className="hidden text-gray-300 sm:block">One application at a time</p>
        </div>
      </footer>
    </div>
  );
}