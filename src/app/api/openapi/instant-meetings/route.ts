import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export async function GET() {
  const filePath = path.join(
    process.cwd(),
    "docs",
    "openapi-instant-meetings.yaml",
  );
  try {
    let body = await readFile(filePath, "utf8");
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      "http://localhost:3332";
    body = body.replace(
      /servers:\n\s*-\s*url:\s*.+\n\s*description:.+/m,
      `servers:\n  - url: ${appUrl}\n    description: This deployment`,
    );
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/yaml; charset=utf-8",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "spec_not_found" }, { status: 404 });
  }
}
