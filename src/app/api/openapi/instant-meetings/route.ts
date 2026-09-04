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
    const body = await readFile(filePath, "utf8");
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
