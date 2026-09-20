import { NextResponse } from "next/server";
import { groqJSON, GroqError } from "@/lib/scholarship/groq";

interface SingleClaimResult {
  analysis?: string;
  strength_score?: number;
  status?: string;
  suggestions?: string[];
}

interface DocumentClaim {
  text: string;
  status: "Supported" | "Needs verification" | "Potentially unsupported";
  evidence: string;
  suggestion?: string;
}

interface DocumentResult {
  claims: DocumentClaim[];
  summary: {
    total: number;
    supported: number;
    needs_verification: number;
    potentially_unsupported: number;
  };
}

const DOC_STATUSES = [
  "Supported",
  "Needs verification",
  "Potentially unsupported",
] as const;

function normalizeStatus(value: unknown): DocumentClaim["status"] {
  if (typeof value === "string" && DOC_STATUSES.includes(value as DocumentClaim["status"])) {
    return value as DocumentClaim["status"];
  }
  return "Needs verification";
}

function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function buildSinglePrompt(input: {
  claim: string;
  context: string;
  applicationId: string;
  university: string;
  program: string;
}): string {
  return `
You are an expert academic auditor and scholarship consultant.

Your task is to analyze a specific claim made by a student in their application materials.

Claim to Analyze:
"${input.claim}"

Context (CV/Achievements/SOP):
${input.context || "No additional context provided."}

Target University:
${input.university || "Not specified"}

Target Program:
${input.program || "Not specified"}

Application ID:
${input.applicationId || "Not specified"}

Analysis Guidelines:

1. Strength:
Determine whether the claim is specific, quantifiable, impactful, and clearly written.

2. Verifiability:
Determine whether the claim can be supported by the provided context.
If there is no supporting evidence, identify that clearly.
Do not assume that an unsupported claim is true.

3. Impact:
Evaluate how useful the claim is for the student's application and whether it is relevant to the target program.

4. Accuracy:
Look for exaggeration, unsupported achievements, vague statements, contradictions, or wording that could mislead an admissions committee.

5. Suggestions:
Provide 2-3 concrete ways to improve the claim while NEVER inventing achievements, numbers, experiences, or facts.

Return ONLY a valid JSON object.
Do not include markdown.
Do not include code fences.

The JSON must have exactly these keys:

{
  "analysis": "Detailed explanation of the claim.",
  "strength_score": 0,
  "status": "Strong",
  "suggestions": [
    "Suggestion 1",
    "Suggestion 2",
    "Suggestion 3"
  ]
}

"strength_score" must be an integer from 0 to 100.

"status" must be exactly one of:
"Strong"
"Needs Evidence"
"Weak"
"Contradictory"
`;
}

function buildDocumentPrompt(input: {
  document: string;
  supportingContext: string;
}): string {
  return `
You are an expert academic auditor for university applications.

Analyze the student's Statement of Purpose below, using the supporting context (the student's profile facts and supporting documents). Extract every factual claim the student makes about themselves — achievements, metrics, grades, experience, skills, collaborations, positions, projects.

For each claim return:
- "text": the exact statement from the SOP, short and as written.
- "status": exactly one of "Supported", "Needs verification", "Potentially unsupported".
  * "Supported" — the supporting context directly confirms the claim.
  * "Needs verification" — the claim is plausible, but the supporting context neither confirms nor contradicts it, and proof (certificate, transcript, reference) would be expected.
  * "Potentially unsupported" — the supporting context contradicts the claim, or the claim is an exaggeration/overstatement that an admissions committee could view as fabrication.
- "evidence": quote the part of the supporting context that confirms or contradicts the claim, or "No matching evidence found in the provided profile or documents."
- "suggestion": a concrete, honest way to support or rephrase the claim. NEVER invent facts, numbers, or documents.

Supporting context (profile facts + documents):
${input.supportingContext || "None provided — verify only the document's internal consistency."}

Statement of Purpose:
"""
${input.document}
"""

Return ONLY a valid JSON object with exactly these keys:
{
  "claims": [
    {
      "text": "...",
      "status": "Supported | Needs verification | Potentially unsupported",
      "evidence": "...",
      "suggestion": "..."
    }
  ]
}

Include the most important claims only (up to 12), ordered as they appear in the document.
`;
}

async function callGemini(promptText: string, temperature: number): Promise<unknown> {
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
  if (!generatedText) throw new Error("Gemini returned an empty response.");

  try {
    return JSON.parse(stripJsonFences(generatedText)) as unknown;
  } catch (parseError) {
    console.error("Failed to parse Gemini JSON:", parseError);
    throw new Error("Gemini returned invalid JSON.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const document = String(body.document ?? "").trim();
    const claim = String(body.claim ?? "").trim();
    const context = String(body.context ?? "").trim();
    const supportingContext = String(body.supportingContext ?? "").trim();
    const university = String(body.university ?? "").trim();
    const program = String(body.program ?? "").trim();
    const applicationId = String(body.applicationId ?? "").trim();

    const isDocumentMode = document.length > 0;

    if (!isDocumentMode && !claim) {
      return NextResponse.json(
        { error: "Claim text or document is required." },
        { status: 400 },
      );
    }

    const temperature = 0.2;
    const promptText = isDocumentMode
      ? buildDocumentPrompt({
          document: document.slice(0, 22000),
          supportingContext: supportingContext.slice(0, 6000),
        })
      : buildSinglePrompt({ claim, context, applicationId, university, program });

    const system =
      "You are an expert academic auditor. Respond only with valid JSON.";

    let parsed: unknown = null;
    let primaryError: unknown = null;

    try {
      parsed = await groqJSON<unknown>({
        system,
        prompt: promptText,
        temperature,
      });
    } catch (groqErr) {
      primaryError = groqErr;
      console.error(
        "Claim analysis Groq failure, falling back to Gemini:",
        groqErr instanceof Error ? groqErr.message : groqErr,
      );
      try {
        parsed = await callGemini(promptText, temperature);
      } catch (gemErr) {
        const message =
          gemErr instanceof Error ? gemErr.message : "AI analysis failed.";
        const detail = primaryError instanceof GroqError ? primaryError.detail : "";
        console.error("Claim analysis Gemini fallback failed:", message);
        return NextResponse.json(
          { error: "Claim analysis failed.", details: detail || message },
          { status: 502 },
        );
      }
    }

    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json(
        { error: "The AI returned an unreadable response." },
        { status: 500 },
      );
    }

    if (isDocumentMode) {
      const raw = parsed as { claims?: unknown };
      const claims: DocumentClaim[] = Array.isArray(raw.claims)
        ? raw.claims
            .filter(
              (c): c is Record<string, unknown> =>
                !!c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string",
            )
            .slice(0, 12)
            .map((c) => ({
              text: String(c.text).trim(),
              status: normalizeStatus(c.status),
              evidence:
                typeof c.evidence === "string" && c.evidence.trim()
                  ? c.evidence.trim()
                  : "No matching evidence found in the provided profile or documents.",
              ...(typeof c.suggestion === "string" && c.suggestion.trim()
                ? { suggestion: c.suggestion.trim() }
                : {}),
            }))
        : [];

      const result: DocumentResult = {
        claims,
        summary: {
          total: claims.length,
          supported: claims.filter((c) => c.status === "Supported").length,
          needs_verification: claims.filter((c) => c.status === "Needs verification").length,
          potentially_unsupported: claims.filter(
            (c) => c.status === "Potentially unsupported",
          ).length,
        },
      };

      return NextResponse.json(result);
    }

    const single = parsed as SingleClaimResult;
    return NextResponse.json({
      analysis: typeof single.analysis === "string" ? single.analysis : "",
      strength_score:
        typeof single.strength_score === "number"
          ? single.strength_score
          : Number(single.strength_score) || 0,
      status: typeof single.status === "string" ? single.status : "Needs Evidence",
      suggestions: Array.isArray(single.suggestions)
        ? single.suggestions.filter((s) => typeof s === "string")
        : [],
    });
  } catch (error) {
    console.error("Claim Checker Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}