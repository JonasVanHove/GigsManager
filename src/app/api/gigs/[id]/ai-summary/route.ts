import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { callGroq, GroqError, isGroqConfigured, parseModelJson } from "@/lib/groq";
import { extractPdfText } from "@/lib/document-text";
import { toInlineImage } from "@/lib/attachment-ocr";
import { requireAuth, requireOwnedGigOr404 } from "@/lib/auth-helpers";

export const runtime = "nodejs";
/** OCR + summarisation is slow; give the function room on serverless. */
export const maxDuration = 60;

const MAX_EXTRACTED_CHARS = 12_000;
const MAX_IMAGES_PER_SUMMARY = 4;

/**
 * Builds the multimodal user message.
 *
 * Attachments live in Supabase Storage and are stored as remote URLs, but Groq
 * only accepts inline `data:` payloads. `toInlineImage` downloads and encodes
 * them; a row that already holds a data URL is passed straight through.
 *
 * Images that already have cached OCR text are skipped here — their text is
 * already in the prompt as a document block, so re-sending the pixels would
 * duplicate the same content in one request.
 */
async function buildUserContent(
  prompt: string,
  imageLabels: string[],
  images: Array<{ id: string; url: string }>
) {
  const capped = images.slice(0, MAX_IMAGES_PER_SUMMARY);

  const inlined = await Promise.all(
    capped.map(async (img) => ({
      id: img.id,
      url: await toInlineImage(img.url),
    }))
  );

  const usable = inlined
    .filter((img): img is { id: string; url: string } => Boolean(img.url))
    .map((img) => ({
      type: "image_url" as const,
      image_url: { url: img.url },
    }));

  if (usable.length === 0) return prompt;

  const includedIds = new Set(
    inlined.filter((img) => img.url).map((img) => img.id)
  );
  const labels = imageLabels.slice(0, includedIds.size);
  const label =
    labels.length > 0
      ? `\n\nThe images below were attached as: ${labels.join(", ")}.`
      : "\n\nThe images below are attached documents.";

  return [
    { type: "text" as const, text: `${prompt}${label}` },
    ...usable,
  ];
}

export type SummarySection = {
  heading: string;
  items: string[];
};

export type SummaryResult = {
  headline: string;
  sections: SummarySection[];
  unresolvedQuestions: string[];
};

const SYSTEM_PROMPT = `You are the assistant of a professional musician/band manager.
You read booking correspondence (contracts, riders, e-mails, WhatsApp exports) and produce a
short executive "State of Play" brief that the manager can act on before travelling to the gig.

Rules:
- Only use facts that are present in the provided material. Never invent fees, dates or names.
- If a category has no information, return an empty items array for it (do not guess).
- Keep every bullet short and concrete (max ~15 words), quantities with their currency.
- Prefer the most recent figure if the source contains several conflicting amounts.
- Unresolved questions are things the band must still confirm/ask, phrased as questions.`;

const USER_PROMPT_SHAPE = `Return ONLY a JSON object with this exact shape:
{
  "headline": "one-sentence overall state of play",
  "sections": [
    { "heading": "Agreed Fee & Logistics", "items": ["..."] },
    { "heading": "Timeline & Soundcheck", "items": ["..."] },
    { "heading": "Special Requests", "items": ["..."] }
  ],
  "unresolvedQuestions": ["..."]
}`;

/**
 * Sends the gig notes + the text extracted from its attachments to Groq and
 * returns a structured "State of Play" summary.
 *
 * Caching: if a summary was already generated and `force` is not set, it is
 * returned as-is — regeneration costs tokens and is rarely needed.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  if (!isGroqConfigured()) {
    return NextResponse.json(
      {
        error:
          "AI summaries are not configured on this server (missing GROQ_API_KEY).",
      },
      { status: 503 }
    );
  }

  try {
    const owned = await requireOwnedGigOr404(params.id, authResult.user.id);
    if (owned.error) return owned.error;
    const gig = owned.gig;

    const body = await request.json().catch(() => ({}));
    const force = Boolean(body?.force);

    const existing = await prisma.gig.findUnique({
      where: { id: gig.id },
      select: { aiSummary: true, aiSummaryAt: true },
    });

    if (!force && existing?.aiSummary) {
      return NextResponse.json({
        summary: JSON.parse(existing.aiSummary),
        cached: true,
        generatedAt: existing.aiSummaryAt,
      });
    }

    const attachments = await prisma.gigAttachment.findMany({
      where: { gigId: gig.id },
      orderBy: { order: "asc" },
      select: {
        id: true,
        url: true,
        storagePath: true,
        title: true,
        type: true,
        mimeType: true,
        extractedText: true,
      },
    });

    // PDFs: extract the text layer once and cache it on the row so subsequent
    // summaries do not re-download and re-parse the document.
    await Promise.all(
      attachments.map(async (attachment) => {
        if (attachment.extractedText || attachment.type !== "pdf") return;
        try {
          const response = await fetch(attachment.url);
          if (!response.ok) return;
          const buffer = Buffer.from(await response.arrayBuffer());
          const text = await extractPdfText(buffer);
          if (text) {
            await prisma.gigAttachment.update({
              where: { id: attachment.id },
              data: { extractedText: text.slice(0, MAX_EXTRACTED_CHARS) },
            });
          }
        } catch (error) {
          console.warn(
            "[ai-summary] Could not extract text from",
            attachment.title || attachment.id,
            error instanceof Error ? error.message : error
          );
        }
      })
    );

    const documents = attachments
      .filter((a) => a.extractedText && a.extractedText.trim().length > 0)
      .map(
        (a) =>
          `### ${a.title || a.id} (${a.type})\n${a.extractedText!.slice(
            0,
            MAX_EXTRACTED_CHARS
          )}`
      );

    // Images go to Groq's vision model directly — no local OCR needed.
    const imageParts = attachments
      .filter((a) => a.type === "image" && !a.extractedText)
      .map(
        (a) =>
          `### ${a.title || a.id} (photo — read the text in this image)`
      );

    const context = [
      `Event: ${gig.eventName}`,
      `Date: ${new Date(gig.date).toISOString().slice(0, 10)}`,
      `Booker/performers: ${gig.performers}`,
      `Musicians on stage: ${gig.numberOfMusicians}`,
      `Agreed performance fee: ${
        gig.performanceFeeUnknown ? "unknown" : gig.performanceFee
      }`,
      `Technical fee: ${gig.technicalFee}`,
      gig.performanceLineup ? `Line-up: ${gig.performanceLineup}` : null,
      gig.notes ? `Internal notes:\n${gig.notes}` : "Internal notes: (none)",
      documents.length > 0
        ? `\nAttached documents:\n${documents.join("\n\n")}`
        : "\nAttached documents: (none)",
    ]
      .filter(Boolean)
      .join("\n");

    const raw = await callGroq(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: await buildUserContent(
            `${context}\n\n${USER_PROMPT_SHAPE}`,
            imageParts,
            attachments.filter((a) => a.type === "image" && !a.extractedText)
          ),
        },
      ],
      {
        json: true,
        temperature: 0.2,
        maxTokens: 1400,
        family: imageParts.length > 0 ? "vision" : "text",
      }
    );

    const parsed = parseModelJson<SummaryResult>(raw);
    if (
      !parsed ||
      typeof parsed.headline !== "string" ||
      !Array.isArray(parsed.sections)
    ) {
      return NextResponse.json(
        { error: "The AI returned an unexpected response. Please try again." },
        { status: 502 }
      );
    }

    const summary: SummaryResult = {
      headline: parsed.headline,
      sections: (parsed.sections ?? [])
        .filter((s) => s && typeof s.heading === "string")
        .map((s) => ({
          heading: s.heading,
          items: Array.isArray(s.items)
            ? s.items
                .filter((i): i is string => typeof i === "string")
                .slice(0, 10)
            : [],
        })),
      unresolvedQuestions: Array.isArray(parsed.unresolvedQuestions)
        ? parsed.unresolvedQuestions
            .filter((q): q is string => typeof q === "string")
            .slice(0, 10)
        : [],
    };

    const generatedAt = new Date();
    await prisma.gig.update({
      where: { id: gig.id },
      data: {
        aiSummary: JSON.stringify(summary),
        aiSummaryAt: generatedAt,
      },
    });

    return NextResponse.json({
      summary,
      cached: false,
      generatedAt,
      attachmentsUsed: documents.length,
    });
  } catch (err) {
    if (err instanceof GroqError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/gigs/[id]/ai-summary error:", err);
    return NextResponse.json(
      { error: "Failed to generate the summary" },
      { status: 500 }
    );
  }
}