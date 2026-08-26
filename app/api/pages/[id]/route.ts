import { NextResponse } from "next/server";
import { getPageById } from "@/lib/services/page";
import { authenticate, withPublicUrl } from "../shared";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate(request, "read");
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await params;
  const page = await getPageById(auth.userId, id);
  if (!page) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Page not found." } },
      { status: 404 },
    );
  }

  return NextResponse.json(withPublicUrl(page));
}
