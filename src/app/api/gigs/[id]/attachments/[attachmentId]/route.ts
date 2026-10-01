import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwnedGigOr404 } from "@/lib/auth-helpers";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; attachmentId: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const owned = await requireOwnedGigOr404(params.id, authResult.user.id);
    if (owned.error) return owned.error;

    // Scoped by gigId as well, so a guessed attachment id cannot delete
    // another user's file.
    const attachment = await prisma.gigAttachment.findFirst({
      where: { id: params.attachmentId, gigId: owned.gig.id },
    });
    if (!attachment) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 }
      );
    }

    // Best-effort storage cleanup; the DB row is the source of truth.
    if (
      attachment.storagePath &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      const { createClient } = await import("@supabase/supabase-js");
      const storage = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      ).storage;
      const { error } = await storage
        .from("gig-attachments")
        .remove([attachment.storagePath]);
      if (error) {
        console.warn(
          "[gig-attachments] Failed to remove file from storage:",
          error.message
        );
      }
    }

    await prisma.gigAttachment.delete({ where: { id: attachment.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/gigs/[id]/attachments/[attachmentId] error:", err);
    return NextResponse.json(
      { error: "Failed to delete attachment" },
      { status: 500 }
    );
  }
}