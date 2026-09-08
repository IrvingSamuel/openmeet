import { NextResponse } from "next/server";

/**
 * Redoc UI for the public OpenMeet API (rooms + meetings).
 * Spec YAML: GET /api/openapi/instant-meetings
 *
 * Light theme + column borders. Avoid blanket color !important on
 * li/span/div — that made selected tabs (dark bg) and Prism tokens
 * unreadable / unstyled.
 */
export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenMeet API — Salas e reuniões</title>
  <meta name="robots" content="noindex" />
  <style>
    html, body {
      margin: 0;
      background: #ffffff;
      color: #0f172a;
    }

    /* Column separation */
    .menu-content {
      background: #f8fafc !important;
      border-right: 2px solid #64748b !important;
      box-shadow: none !important;
    }
    .redoc-wrap > div:last-child {
      background: #e2e8f0 !important;
      border-left: 2px solid #64748b !important;
    }

    /* Sample tabs — selected is dark; text must be white */
    .react-tabs__tab {
      color: #0f172a !important;
      background: transparent !important;
    }
    .react-tabs__tab--selected {
      color: #ffffff !important;
      background: #0f172a !important;
      border-color: #0f172a !important;
    }

    /* Code sample panel: white card, keep Prism token colors */
    .react-tabs__tab-panel {
      background: #ffffff !important;
      color: #0f172a !important;
    }
    .react-tabs__tab-panel code {
      background: #f8fafc !important;
      display: block;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      overflow-x: auto;
    }
    /* Restore Prism-ish colors (overrides were flattening all tokens) */
    .token.comment,
    .token.prolog,
    .token.doctype,
    .token.cdata { color: #64748b !important; }
    .token.punctuation { color: #475569 !important; }
    .token.property,
    .token.tag,
    .token.boolean,
    .token.number,
    .token.constant,
    .token.symbol { color: #0369a1 !important; }
    .token.selector,
    .token.attr-name,
    .token.string,
    .token.char,
    .token.builtin { color: #047857 !important; }
    .token.operator,
    .token.entity,
    .token.url { color: #b45309 !important; }
    .token.atrule,
    .token.attr-value,
    .token.keyword { color: #7c3aed !important; }
    .token.function,
    .token.class-name { color: #c026d3 !important; }

    /* Dropdown / labels in sample panel */
    .react-tabs__tab-panel select,
    .react-tabs__tab-panel label {
      color: #0f172a !important;
      background: #ffffff !important;
    }
    .react-tabs__tab-panel select {
      border: 1px solid #64748b !important;
    }
  </style>
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
        theme: {
          colors: {
            primary: { main: "#0284c7" },
            text: {
              primary: "#0f172a",
              secondary: "#334155"
            },
            http: {
              get: "#0ea5e9",
              post: "#059669",
              put: "#d97706",
              delete: "#dc2626"
            }
          },
          typography: {
            fontSize: "15px",
            fontFamily: "Inter, system-ui, sans-serif",
            headings: {
              fontFamily: "Inter, system-ui, sans-serif",
              fontWeight: "700"
            },
            code: {
              backgroundColor: "#e2e8f0",
              color: "#0f172a"
            }
          },
          sidebar: {
            backgroundColor: "#f8fafc",
            textColor: "#0f172a",
            activeTextColor: "#0284c7",
            width: "280px"
          },
          rightPanel: {
            backgroundColor: "#e2e8f0",
            textColor: "#0f172a",
            width: "40%"
          },
          codeBlock: {
            backgroundColor: "#f8fafc"
          }
        }
      },
      document.getElementById("redoc")
    );
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
