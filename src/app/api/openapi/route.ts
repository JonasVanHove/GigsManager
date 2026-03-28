import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/version";
import { openApiDocument } from "@/lib/openapi";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ...openApiDocument,
    info: {
      ...openApiDocument.info,
      version: APP_VERSION,
    },
  });
}
