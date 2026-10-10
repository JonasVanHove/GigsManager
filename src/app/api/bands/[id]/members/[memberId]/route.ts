import { NextRequest, NextResponse } from "next/server";
import { DELETE as deleteMember } from "../route";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  const url = new URL(request.url);
  url.searchParams.set("memberId", params.memberId);
  const forwardedRequest = new NextRequest(url.toString(), {
    headers: request.headers,
    method: "DELETE",
  });
  return deleteMember(forwardedRequest, { params: { id: params.id } });
}
