import { NextResponse } from "next/server";
import { cancelSeerrRequest } from "@/src/actions/seerr";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_: Request, props: RouteParams): Promise<NextResponse> {
  const { id } = await props.params;
  const requestId = Number(id);
  if (!requestId || Number.isNaN(requestId)) {
    return NextResponse.json(
      { success: false, message: "Invalid request id" },
      { status: 400 },
    );
  }
  const result = await cancelSeerrRequest(requestId);
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
