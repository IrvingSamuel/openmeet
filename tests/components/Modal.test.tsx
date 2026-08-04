import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "@/components/ui/Modal";

function open(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const onClose = vi.fn();
  render(
    <Modal open onClose={onClose} title="Nova sala" {...props}>
      <p>conteúdo</p>
    </Modal>,
  );
  return { onClose };
}

describe("Modal", () => {
  it("renders nothing while closed", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Nova sala">
        <p>conteúdo</p>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("exposes an accessible dialog when open", () => {
    open();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Nova sala");
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
  });

  it("closes on the close button", async () => {
    const { onClose } = open();
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on Escape", async () => {
    const { onClose } = open();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("locks body scroll while open and restores it on unmount", () => {
    const { unmount } = render(
      <Modal open onClose={() => {}} title="Nova sala">
        <p>conteúdo</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("renders the description when provided", () => {
    open({ description: "O slug vem do título." });
    expect(screen.getByText("O slug vem do título.")).toBeInTheDocument();
  });
});
