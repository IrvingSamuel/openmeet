import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "@/components/ui/Toast";

function Harness() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success("Sala criada")}>ok</button>
      <button onClick={() => toast.error("Falhou")}>erro</button>
    </div>
  );
}

describe("ToastProvider", () => {
  it("shows a toast pushed from a consumer", async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "ok" }));
    expect(await screen.findByText("Sala criada")).toBeInTheDocument();
  });

  it("stacks multiple toasts", async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "ok" }));
    await userEvent.click(screen.getByRole("button", { name: "erro" }));
    await waitFor(() => {
      expect(screen.getByText("Sala criada")).toBeInTheDocument();
      expect(screen.getByText("Falhou")).toBeInTheDocument();
    });
  });

  it("announces politely for screen readers", async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("throws when useToast is used without a provider", () => {
    expect(() => render(<Harness />)).toThrow(/ToastProvider/);
  });
});
