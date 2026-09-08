import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/Toast";

import DashboardPage from "@/app/[locale]/dashboard/page";
import { withIntl } from "../helpers/intl";

const ROOMS = [
  {
    id: "r1",
    slug: "weekly",
    title: "Weekly de produto",
    boardId: "board-1",
    createdAt: new Date().toISOString(),
  },
  {
    id: "r2",
    slug: "vestra",
    title: "Piloto Vestra",
    boardId: null,
    createdAt: new Date().toISOString(),
  },
];

function mockApi({
  loggedIn = true,
  rooms = ROOMS,
}: {
  loggedIn?: boolean;
  rooms?: typeof ROOMS;
} = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    if (url === "/api/auth/me") {
      return json(
        loggedIn
          ? { isLoggedIn: true, name: "Ana Ribeiro", email: "ana@chronos.pt" }
          : { isLoggedIn: false },
      );
    }
    if (url === "/api/rooms" && init?.method === "POST") {
      return json({ room: { slug: "nova-sala" } }, 201);
    }
    if (url === "/api/rooms") return json({ rooms });
    if (url.startsWith("/api/meetings")) return json({ meetings: [] });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

function renderDashboard() {
  return render(
    withIntl(
      <ToastProvider>
        <DashboardPage />
      </ToastProvider>,
    ),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("DashboardPage", () => {
  it("invites anonymous visitors to authenticate", async () => {
    mockApi({ loggedIn: false });
    renderDashboard();
    expect(
      await screen.findByRole("heading", { name: /entre para criar salas/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /entrar/i }),
    ).toHaveAttribute("href", "/login");
  });

  it("greets the signed-in user by first name", async () => {
    mockApi();
    renderDashboard();
    expect(await screen.findByText("Ana")).toBeInTheDocument();
  });

  it("lists the rooms returned by the API", async () => {
    mockApi();
    renderDashboard();
    expect(await screen.findByText("Weekly de produto")).toBeInTheDocument();
    expect(screen.getByText("Piloto Vestra")).toBeInTheDocument();
    expect(screen.getByText("/r/weekly")).toBeInTheDocument();
  });

  it("marks rooms linked to a Chronos board", async () => {
    mockApi();
    renderDashboard();
    await screen.findByText("Weekly de produto");
    expect(screen.getAllByText("quadro vinculado")).toHaveLength(1);
  });

  it("filters the list as the user types", async () => {
    mockApi();
    renderDashboard();
    await screen.findByText("Weekly de produto");
    await userEvent.type(screen.getByLabelText("Filtrar salas"), "vestra");
    await waitFor(() => {
      expect(screen.queryByText("Weekly de produto")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Piloto Vestra")).toBeInTheDocument();
  });

  it("explains when a filter matches nothing", async () => {
    mockApi();
    renderDashboard();
    await screen.findByText("Weekly de produto");
    await userEvent.type(screen.getByLabelText("Filtrar salas"), "zzz");
    expect(
      await screen.findByText("Nenhuma sala com esse filtro"),
    ).toBeInTheDocument();
  });

  it("offers a first-run empty state", async () => {
    mockApi({ rooms: [] });
    renderDashboard();
    expect(await screen.findByText("Nenhuma sala ainda")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /criar primeira sala/i }),
    ).toBeInTheDocument();
  });

  it("creates a room through the modal and refreshes the list", async () => {
    const { calls } = mockApi({ rooms: [] });
    renderDashboard();
    await screen.findByText("Nenhuma sala ainda");

    await userEvent.click(screen.getByRole("button", { name: /nova sala/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByLabelText("Título da reunião"),
      "Retro de sprint",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Criar sala" }),
    );

    await waitFor(() => {
      const post = calls.find(
        (c) => c.url === "/api/rooms" && c.init?.method === "POST",
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.init?.body))).toMatchObject({
        title: "Retro de sprint",
      });
    });
    expect(await screen.findByText(/sala \/nova-sala criada/i)).toBeInTheDocument();
  });

  it("shows account as connected when signed in", async () => {
    mockApi();
    renderDashboard();
    expect(await screen.findByText("Conta")).toBeInTheDocument();
    expect(screen.getByText("Conectada")).toBeInTheDocument();
  });
});
