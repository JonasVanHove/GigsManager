import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

export const runtime = "nodejs";

async function requireAuth(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getOrCreateUser(
    data.user.id,
    data.user.email || "",
    data.user.user_metadata?.name
  );

  return { user };
}

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-");
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    const includeChords = request.nextUrl.searchParams.get("includeChords") === "1";
    const includeTuning = request.nextUrl.searchParams.get("includeTuning") === "1";

    const setlist = await prisma.setlist.findFirst({
      where: { id: params.id, userId: user.id },
      include: { items: { orderBy: { order: "asc" } } },
    });

    if (!setlist) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const paragraphs: Paragraph[] = [
      new Paragraph({
        text: setlist.title,
        heading: HeadingLevel.HEADING_1,
      }),
    ];

    if (setlist.description) {
      paragraphs.push(
        new Paragraph({
          text: setlist.description,
        })
      );
    }

    paragraphs.push(new Paragraph({ text: "" }));

    const items = setlist.items as Array<{
      type: string;
      title: string | null;
      notes: string | null;
      chords: string | null;
      tuning: string | null;
    }>;

    items.forEach((item, index: number) => {
      const label = item.type === "note" ? "Note" : "Song";
      const title = item.title?.trim() || (item.type === "note" ? "" : "Untitled");
      const headerText = title ? `${index + 1}. ${title}` : `${index + 1}. ${label}`;

      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: headerText, bold: true }),
          ],
        })
      );

      if (item.type === "note") {
        const noteText = item.notes?.trim();
        if (noteText) {
          paragraphs.push(
            new Paragraph({
              children: [new TextRun({ text: noteText, italics: true })],
            })
          );
        }
        paragraphs.push(new Paragraph({ text: "" }));
        return;
      }

      if (includeTuning && item.tuning?.trim()) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: "Tuning: ", bold: true }),
              new TextRun({ text: item.tuning.trim() }),
            ],
          })
        );
      }

      if (includeChords && item.chords?.trim()) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: "Chords: ", bold: true }),
              new TextRun({ text: item.chords.trim() }),
            ],
          })
        );
      }

      if (item.notes?.trim()) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: "Notes: ", bold: true }),
              new TextRun({ text: item.notes.trim() }),
            ],
          })
        );
      }

      paragraphs.push(new Paragraph({ text: "" }));
    });

    const doc = new Document({
      sections: [
        {
          children: paragraphs,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const arrayBuffer = new Uint8Array(buffer);
    const filename = `${safeFileName(setlist.title || "setlist")}.docx` || "setlist.docx";

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
      },
    });
  } catch (error) {
    console.error("GET /api/setlists/[id]/export error:", error);
    return NextResponse.json(
      { error: "Failed to export setlist" },
      { status: 500 }
    );
  }
}
