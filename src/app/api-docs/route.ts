import { NextResponse } from "next/server";

/**
 * Redoc UI for the Instant Meetings OpenAPI spec.
 * Spec JSON/YAML: GET /api/openapi/instant-meetings
 */
export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chronos Meet API — Instant Meetings</title>
  <meta name="robots" content="noindex" />
  <style>body { margin: 0; background: #0b1020; }</style>
</head>
<body>
  <div id="redoc"></div>
  <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  <script>
    Redoc.init(
      "/api/openapi/instant-meetings",
      {
        scrollYOffset: 0,
        hideDownloadButton: false,
        theme: { colors: { primary: { main: "#8b5cf6" } } }
      },
      document.getElementById("redoc")
    );
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}
