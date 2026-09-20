import { NextResponse } from "next/server";
import { groqJSON, GroqError } from "@/lib/scholarship/groq";

interface SOPResult {
  content: string;
  suggestions: string[];
}

interface ProfileContext {
  fullName?: string;
  location?: string;
  educationLevel?: string;
  university?: string;
  major?: string;
  graduationYear?: number | null;
  gpa?: number | null;
  gpaScale?: string;
  interests?: string[];
  preferredField?: string;
  ieltsStatus?: string;
  ieltsBand?: number | null;
  degreeLevels?: string[];
  destinations?: string[];
  fundingPreferences?: string[];
}

interface SOPInput {
  university: string;
  program: string;
  wordLimit: number | null;
  requirements: string;
  prompt: string;
  additionalInfo: string;
  mode: "generate" | "improve";
  currentContent: string;
  suggestions: string[];
  profile?: ProfileContext;
  legacy?: {
    academicBackground?: string;
    experience?: string;
    skills?: string;
    achievements?: string;
    goals?: string;
  };
}

function studentFactsText(input: SOPInput): string {
  const l = input.legacy;

  if (
    l?.academicBackground ||
    l?.experience ||
    l?.skills ||
    l?.achievements ||
    l?.goals
  ) {
    return [
      `Academic background: ${l.academicBackground || "Not provided"}`,
      `Experience: ${l.experience || "Not provided"}`,
      `Skills: ${l.skills || "Not provided"}`,
      `Achievements: ${l.achievements || "Not provided"}`,
      `Future goals: ${l.goals || "Not provided"}`,
    ].join("\n");
  }

  const p = input.profile;
  const parts: string[] = [];
  if (p) {
    if (p.fullName) parts.push(`Name: ${p.fullName}`);
    if (p.location) parts.push(`Current location: ${p.location}`);
    if (p.educationLevel) parts.push(`Education level: ${p.educationLevel}`);
    if (p.university) parts.push(`Current / previous university: ${p.university}`);
    if (p.major) parts.push(`Field of study / major: ${p.major}`);
    if (p.graduationYear) parts.push(`Graduation year: ${p.graduationYear}`);
    if (p.gpa != null)
      parts.push(`GPA: ${p.gpa}${p.gpaScale ? ` / ${p.gpaScale}` : ""}`);
    if (p.interests?.length) parts.push(`Areas of interest: ${p.interests.join(", ")}`);
    if (p.preferredField) parts.push(`Preferred field: ${p.preferredField}`);
    if (p.degreeLevels?.length) parts.push(`Degree levels: ${p.degreeLevels.join(", ")}`);
    if (p.destinations?.length)
      parts.push(`Preferred study destinations: ${p.destinations.join(", ")}`);
    if (p.fundingPreferences?.length)
      parts.push(`Funding preferences: ${p.fundingPreferences.join(", ")}`);
    if (p.ieltsStatus)
      parts.push(
        `English proficiency: ${p.ieltsStatus}${p.ieltsBand ? ` · Band ${p.ieltsBand}` : ""}`,
      );
  }
  if (input.additionalInfo)
    parts.push(`Additional context from the student: ${input.additionalInfo}`);

  return parts.length
    ? parts.join("\n")
    : "No student background facts were provided.";
}

function wordTarget(wordLimit: number | null): string {
  if (wordLimit) {
    const low = Math.max(Math.round(wordLimit * 0.9), 1);
    const high = Math.round(wordLimit * 1.1);
    return `approximately ${wordLimit} words (aim for ${low}–${high} words; never exceed about ${high}).`;
  }
  return "a typical length (roughly 600–900 words) unless the official requirements specify otherwise.";
}

function buildGeneratePrompt(input: SOPInput): string {
  const { university, program } = input;
  return `
You are an expert academic consultant writing a Statement of Purpose (SOP) for a real university application.

TARGET:
University: ${university}
Program: ${program}

WORD TARGET: ${wordTarget(input.wordLimit)}

OFFICIAL SOP REQUIREMENTS (pasted verbatim by the student from the university's official application site — follow them exactly; never invent any requirement that is not written here):
${input.requirements || "None provided. Write a strong, standard SOP structure."}

STUDENT INSTRUCTIONS:
${input.prompt || "Write a compelling, personalized SOP for this program."}

STUDENT FACTS (the ONLY facts about the student that may be used — absolutely do not invent anything else):
${studentFactsText(input)}

RULES:
1. Use ONLY the student facts listed above. Never invent achievements, metrics, grades, projects, positions, awards, research, internships, or any biography detail.
2. Make the SOP specific to ${university}'s ${program}: connect the student's motivation and goals to this program and university using only the facts provided. Do not invent professor names, courses, rankings, facilities, or university statistics.
3. Follow the OFFICIAL SOP REQUIREMENTS exactly when provided (structure, sections, word count).
4. Respect the WORD TARGET above.
5. Use a formal, authentic, persuasive, first-person academic voice. Avoid generic AI phrases and exaggeration.
6. Structure: a strong opening hook -> academic background -> relevant experience and skills -> motivation plus why this program/university -> future goals -> a strong conclusion.
7. Make the transitions between paragraphs natural and keep the essay coherent.

Return ONLY a valid JSON object with exactly these keys:
{
  "content": "The complete SOP text, as plain paragraphs separated by blank lines.",
  "suggestions": ["specific improvement tip 1", "tip 2", "tip 3"]
}

"suggestions" must be concrete, specific pointers to strengthen this exact SOP without inventing facts.
`;
}

function buildImprovePrompt(input: SOPInput): string {
  const { university, program } = input;
  const notes = input.suggestions
    .map((s) => `- ${s}`)
    .join("\n");
  return `
You are an expert academic consultant refining a Statement of Purpose for ${university} (program: ${program}).

LENGTH: keep the improved essay close to the current draft's length${
    input.wordLimit ? ` (target about ${input.wordLimit} words)` : ""
  }.

OFFICIAL SOP REQUIREMENTS (follow exactly when provided):
${input.requirements || "None provided."}

CURRENT SOP DRAFT:
"""
${input.currentContent}
"""

REVIEWER NOTES (apply only where genuinely useful; never invent facts):
${notes || "- None."}

RULES:
1. Keep every factual claim already present in the draft. Do not add, remove, or alter any fact.
2. Improve flow, specificity, word choice, and academic tone while keeping the essay specific to ${university}'s ${program}.
3. Do not invent professors, courses, rankings, facilities, or university statistics.
4. Preserve the overall structure and approximate length of the draft.
5. Make the essay clearly and specifically motivated toward ${university} and ${program}.

Return ONLY a valid JSON object with exactly these keys:
{
  "content": "The full improved SOP text, as plain paragraphs separated by blank lines.",
  "suggestions": ["3 new specific improvement tips"]
}
`;
}

function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

async function callGemini(promptText: string, temperature: number): Promise<SOPResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API key is not configured.");

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: promptText }],
          },
        ],
        generationConfig: {
          temperature,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API Error:", errorText);
    throw new Error("Gemini API request failed.");
  }

  const data = await response.json();
  const generatedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!generatedText) {
    throw new Error("Gemini returned an empty response.");
  }

  try {
    return JSON.parse(stripJsonFences(generatedText)) as SOPResult;
  } catch (parseError) {
    console.error("Failed to parse Gemini JSON:", parseError);
    throw new Error("Gemini returned invalid JSON.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const university = String(body.university ?? "").trim();
    const program = String(body.program ?? "").trim();

    if (!university || !program) {
      return NextResponse.json(
        { error: "University and Program are required." },
        { status: 400 },
      );
    }

    const rawLimit = Number(body.wordLimit);
    const wordLimit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.round(rawLimit) : null;

    const profile: ProfileContext | undefined =
      body.profile && typeof body.profile === "object"
        ? (body.profile as ProfileContext)
        : undefined;

    const input: SOPInput = {
      university,
      program,
      wordLimit,
      requirements: String(body.requirements ?? "").trim(),
      prompt: String(body.prompt ?? "").trim(),
      additionalInfo: String(body.additionalInfo ?? "").trim(),
      mode: body.mode === "improve" ? "improve" : "generate",
      currentContent: String(body.currentContent ?? "").trim(),
      suggestions: Array.isArray(body.suggestions)
        ? body.suggestions.map((s: unknown) => String(s).trim()).filter(Boolean)
        : [],
      profile,
      legacy:
        body.academicBackground ||
        body.experience ||
        body.skills ||
        body.achievements ||
        body.goals
          ? {
              academicBackground: String(body.academicBackground ?? "").trim(),
              experience: String(body.experience ?? "").trim(),
              skills: String(body.skills ?? "").trim(),
              achievements: String(body.achievements ?? "").trim(),
              goals: String(body.goals ?? "").trim(),
            }
          : undefined,
    };

    if (input.mode === "improve" && !input.currentContent) {
      return NextResponse.json(
        { error: "No draft content to improve." },
        { status: 400 },
      );
    }

    const promptText =
      input.mode === "improve"
        ? buildImprovePrompt(input)
        : buildGeneratePrompt(input);
    const temperature = input.mode === "improve" ? 0.4 : 0.7;

    try {
      const result = await groqJSON<SOPResult>({
        system:
          "You write precise, authentic Statement of Purpose essays from real student facts. Respond only with valid JSON.",
        prompt: promptText,
        temperature,
      });

      return NextResponse.json(result);
    } catch (groqErr) {
      console.error(
        "SOP Groq failure, falling back to Gemini:",
        groqErr instanceof Error ? groqErr.message : groqErr,
      );

      try {
        const result = await callGemini(promptText, temperature);
        return NextResponse.json(result);
      } catch (gemErr) {
        const message =
          gemErr instanceof Error ? gemErr.message : "AI generation failed.";
        const detail = groqErr instanceof GroqError ? groqErr.detail : "";
        console.error("SOP Gemini fallback failed:", message);

        return NextResponse.json(
          { error: "SOP generation failed.", details: detail || message },
          { status: 502 },
        );
      }
    }
  } catch (error) {
    console.error("SOP Generation Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}