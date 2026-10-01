import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwnedGigOr404 } from "@/lib/auth-helpers";

/** Attachments are small documents/photos — cap the payload defensively. */
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function inferType(mimeType: string): "pdf" | "image" {
  return mimeType === "application/pdf" ? "pdf" : "image";
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const owned = await requireOwnedGigOr404(params.id, authResult.user.id);
    if (owned.error) return owned.error;
    const gig = owned.gig;

    const body = await request.json();
    const { dataUrl, title, description } = body ?? {};

    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      return NextResponse.json(
        { error: "dataUrl is required (format: data:<mime>;base64,<payload>)" },
        { status: 400 }
      );
    }

    const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json(
        { error: "Malformed data URL — expected base64 encoded content" },
        { status: 400 }
      );
    }

    const mimeType = match[1];
    const normalizedMime = mimeType.toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
      return NextResponse.json(
        { error: "Unsupported file type. Allowed: PDF, JPEG, PNG, WebP." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(match[2], "base64");
    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }
    if (buffer.byteLength > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File is larger than 8 MB" },
        { status: 413 }
      );
    }

    const max = await prisma.gigAttachment.aggregate({
      where: { gigId: gig.id },
      _max: { order: true },
    });
    const order = (max._max.order ?? 0) + 1;

    const safeName = (title || `attachment-${Date.now()}`)
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .slice(0, 80);
    const extension =
      normalizedMime === "application/pdf"
        ? "pdf"
        : normalizedMime.split("/")[1] || "bin";
    const storagePath = `${authResult.user.id}/gigs/${gig.id}/${Date.now()}-${safeName}.${extension}`;

    // Supabase Storage is optional: without it we fall back to a data URL so
    // the feature still works in local / self-hosted setups.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let url = dataUrl;
    let storedPath: string | null = null;

    if (supabaseUrl && serviceKey) {
      const { createClient } = await import("@supabase/supabase-js");
      const storage = createClient(supabaseUrl, serviceKey).storage;
      const { error: uploadError } = await storage
        .from("gig-attachments")
        .upload(storagePath, buffer, { contentType: normalizedMime, upsert: false });

      if (uploadError) {
        console.warn(
          "[gig-attachments] Storage upload failed, keeping data URL:",
          uploadError.message
        );
      } else {
        storedPath = storagePath;
        url = storage
          .from("gig-attachments")
          .getPublicUrl(storagePath).data.publicUrl;
      }
    }

    const attachment = await prisma.gigAttachment.create({
      data: {
        gigId: gig.id,
        url,
        storagePath: storedPath,
        type: inferType(normalizedMime),
        title: title ? String(title).slice(0, 200) : null,
        description: description ? String(description).slice(0, 500) : null,
        mimeType: normalizedMime,
        fileSize: buffer.byteLength,
        order,
      },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (err) {
    console.error("POST /api/gigs/[id]/attachments error:", err);
    return NextResponse.json(
      { error: "Failed to create attachment" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const owned = await requireOwnedGigOr404(params.id, authResult.user.id);
    if (owned.error) return owned.error;

    const attachments = await prisma.gigAttachment.findMany({
      where: { gigId: owned.gig.id },
      orderBy: { order: "asc" },
      // extractedText can be large and is only needed by the AI route.
      select: {
        id: true,
        url: true,
        storagePath: true,
        type: true,
        title: true,
        description: true,
        mimeType: true,
        fileSize: true,
        order: true,
        uploadedAt: true,
      },
    });

    return NextResponse.json(attachments);
  } catch (err) {
    console.error("GET /api/gigs/[id]/attachments error:", err);
    return NextResponse.json(
      { error: "Failed to fetch attachments" },
      { status: 500 }
    );
  }
}