import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { callGroq, GroqError, isGroqConfigured, parseModelJson } from "@/lib/groq";
import { requireAuth, requireOwnedGigOr404 } from "@/lib/auth-helpers";
import { MESSAGE_KINDS, type MessageKind, type DraftedMessage } from "@/lib/gig-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You draft short, friendly, professional messages from a band manager
to a venue booker, promoter or technician.

Rules:
- Write like a working musician, not a corporate template: warm, direct, to the point.
- Only use the facts that are given. If a detail is missing, write a short
  placeholder such as [venue contact] instead of inventing it.
- Never invent fees, invoice numbers, times or names.
- Keep it under 150 words for WhatsApp, under 220 for email.
- Sign off as "the band" / the given artist name; never sign as a named person
  who was not provided.`;

const SHAPES: Record<MessageKind, { intent: string; channel: DraftedMessage["channel"] }> = {
  rider: {
    intent:
      "Confirm the technical rider and the day's schedule: ask the booker to confirm the " +
      "stage plot, backline, monitor mix, soundcheck slot and that everything in the rider " +
      "will be available. Be specific and list what needs confirming.",
    channel: "email",
  },
  arrival: {
    intent:
      "Confirm the band's arrival and logistics: expected arrival time, load-in needs, " +
      "parking/loading access, who to ask for on site, and the soundcheck slot. " +
      "Keep it short enough for WhatsApp.",
    channel: "whatsapp",
  },
  thankyou: {
    intent:
      "Thank the audience and crew after the gig and politely mention the invoice / " +
      "payment status without being pushy. Ask for a payment reference or bank transfer " +
      "details if the invoice was not sent yet.",
    channel: "email",
  },
};

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  if (!isGroqConfigured()) {
    return NextResponse.json(
      { error: "AI messages are not configured (missing GROQ_API_KEY)." },
      { status: 503 }
    );
  }

  try {
    const owned = await requireOwnedGigOr404(params.id, authResult.user.id);
    if (owned.error) return owned.error;
    const gig = owned.gig;

    const body = await request.json().catch(() => ({}));
    const requestedKind = typeof body?.kind === "string" ? body.kind : "rider";
    const kind = (MESSAGE_KINDS as readonly string[]).includes(requestedKind)
      ? (requestedKind as MessageKind)
      : "rider";
    const shape = SHAPES[kind];

    // Setlist title + share link give the message something concrete to point at.
    const setlist = gig.setlistId
      ? await prisma.setlist.findFirst({
          where: { id: gig.setlistId, userId: authResult.user.id },
          select: {
          id: true,
          title: true,
          items: {
            select: { title: true, type: true },
            orderBy: { order: "asc" },
          },
        }
        })
      : null;

    const songCount = setlist?.items.filter((item) => item.type === "song").length ?? 0;
    const attachments = await prisma.gigAttachment.findMany({
      where: { gigId: gig.id },
      orderBy: { order: "asc" },
      select: { title: true, url: true },
    });

    const appOrigin =
      process.env.NEXT_PUBLIC_APP_URL ||
      (request.headers.get("origin") || "").replace(/\/$/, "");

    const context = [
      `Artist / band: ${gig.performers}`,
      `Event: ${gig.eventName}`,
      `Date: ${new Date(gig.date).toISOString().slice(0, 10)}`,
      `Venue: ${gig.venueName || "[venue to confirm]"}`,
      `Address: ${gig.venueLocation || "[address to confirm]"}`,
      `Organizer contact: ${gig.organizerName || "[organizer name]"}${
        gig.organizerEmail ? ` (${gig.organizerEmail})` : ""
      }${gig.organizerPhone ? ` (${gig.organizerPhone})` : ""}`,
      `Soundcheck: ${gig.soundcheckTime || "[to confirm]"}`,
      `Doors open: ${gig.doorsOpenTime || "[to confirm]"}`,
      `Set length: ${gig.performanceDurationMinutes || 90} minutes`,
      `Musicians: ${gig.numberOfMusicians}`,
      `Gear notes: ${gig.gearSetupNotes || "not specified"}`,
      setlist
        ? `Setlist: "${setlist.title}" (${songCount} songs)`
        : "Setlist: not linked yet",
      appOrigin && setlist
        ? `Setlist link: ${appOrigin}/share/${setlist.id}`
        : "Setlist link: not available",
      attachments.length > 0
        ? `Attachments: ${attachments.map((a) => a.title || a.url).join(", ")}`
        : "Attachments: none",
      gig.notes ? `Internal notes: ${gig.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const raw = await callGroq(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `${context}\n\nTask: ${shape.intent}

Return ONLY a JSON object: { "subject": "short subject line", "body": "the message text" }`,
        },
      ],
      { json: true, temperature: 0.5, maxTokens: 900 }
    );

    const parsed = parseModelJson<DraftedMessage>(raw);
    if (!parsed || typeof parsed.body !== "string" || parsed.body.trim() === "") {
      return NextResponse.json(
        { error: "The AI returned an unexpected response. Please try again." },
        { status: 502 }
      );
    }

    const message: DraftedMessage = {
      subject: typeof parsed.subject === "string" ? parsed.subject : "",
      body: parsed.body.trim(),
      channel: shape.channel,
    };

    return NextResponse.json({ message, kind });
  } catch (err) {
    if (err instanceof GroqError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/gigs/[id]/ai-draft-message error:", err);
    return NextResponse.json(
      { error: "Failed to draft the message" },
      { status: 500 }
    );
  }
}
