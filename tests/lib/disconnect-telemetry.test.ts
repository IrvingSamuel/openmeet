import { afterEach, describe, expect, it } from "vitest";
import { clientErrorDetails } from "@/lib/disconnect-telemetry";

const html = document.documentElement;

afterEach(() => {
  html.lang = "";
  html.className = "";
});

describe("clientErrorDetails", () => {
  it("records the page language and that Google Translate is active", () => {
    html.lang = "pt";
    html.className = "__variable_f367f3 translated-ltr";

    const details = clientErrorDetails(new Error("boom"), "\n    at span");

    expect(details).toMatchObject({
      name: "Error",
      message: "boom",
      htmlLang: "pt",
      translated: true,
      navigatorLanguage: navigator.language,
    });
  });

  it("reports an untranslated page", () => {
    html.lang = "en";
    html.className = "__variable_f367f3";

    expect(clientErrorDetails(new Error("boom"))).toMatchObject({
      htmlLang: "en",
      translated: false,
    });
  });
});
