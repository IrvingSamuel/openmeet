import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrandPanel } from "@/components/BrandPanel";
import { ToastProvider } from "@/components/ui/Toast";
import { BOARD_THEMES } from "@/lib/brand";
import { withIntl } from "../helpers/intl";

const INITIAL = {
  themePreset: "indigo",
  primaryColor: "#6366f1",
  secondaryColor: "#22d3ee",
  tertiaryColor: "#a855f7",
  background: "#0b1020",
  lobbyTitle: "Weekly de produto",
  lobbySubtitle: "Powered by Chronos Meet",
  logoUrl: null,
  customCss: null,
};

function mockApi() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const body =
        init?.method === "PATCH"
          ? { brand: { ...INITIAL, ...JSON.parse(String(init.body)) } }
          : { brand: INITIAL };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return calls;
}

function renderPanel() {
  return render(
    withIntl(
      <ToastProvider>
        <BrandPanel slug="weekly" />
      </ToastProvider>,
    ),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("BrandPanel", () => {
  it("hydrates the form from the brand endpoint", async () => {
    mockApi();
    renderPanel();
    await waitFor(() =>
      expect(screen.getByLabelText("Título do lobby")).toHaveValue(
        "Weekly de produto",
      ),
    );
  });

  it("shows the live preview with the current copy", async () => {
    mockApi();
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText("Pré-visualização ao vivo")).toBeInTheDocument(),
    );
    expect(screen.getAllByText("Weekly de produto").length).toBeGreaterThan(0);
  });

  it("switches between the identity, palette and advanced tabs", async () => {
    mockApi();
    renderPanel();
    await screen.findByLabelText("Título do lobby");

    await userEvent.click(screen.getByRole("button", { name: "Paleta" }));
    expect(await screen.findByLabelText("Primária hex")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Avançado" }));
    expect(
      await screen.findByLabelText("CSS customizado"),
    ).toBeInTheDocument();
  });

  it("applies every color of a preset at once", async () => {
    mockApi();
    renderPanel();
    await screen.findByLabelText("Título do lobby");
    await userEvent.click(screen.getByRole("button", { name: "Paleta" }));
    await userEvent.click(screen.getByRole("button", { name: /emerald/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Primária hex")).toHaveValue(
        BOARD_THEMES.emerald.primary,
      );
    });
    expect(screen.getByLabelText("Secundária hex")).toHaveValue(
      BOARD_THEMES.emerald.secondary,
    );
  });

  it("sends the edited fields on save", async () => {
    const calls = mockApi();
    renderPanel();
    const title = await screen.findByLabelText("Título do lobby");
    await userEvent.clear(title);
    await userEvent.type(title, "Retro");
    await userEvent.click(screen.getByRole("button", { name: "Salvar marca" }));

    await waitFor(() => {
      const patch = calls.find((c) => c.init?.method === "PATCH");
      expect(JSON.parse(String(patch?.init?.body))).toMatchObject({
        lobbyTitle: "Retro",
      });
    });
    expect(await screen.findByText(/marca salva/i)).toBeInTheDocument();
  });

  it("asks the API to import the identity from the linked board", async () => {
    const calls = mockApi();
    renderPanel();
    await screen.findByLabelText("Título do lobby");
    await userEvent.click(
      screen.getByRole("button", { name: /importar do quadro/i }),
    );
    await waitFor(() => {
      const patch = calls.find((c) => c.init?.method === "PATCH");
      expect(JSON.parse(String(patch?.init?.body))).toEqual({
        importFromBoard: true,
      });
    });
  });
});
