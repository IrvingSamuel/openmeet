import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColorField, Input, Select } from "@/components/ui/Field";

describe("Input", () => {
  it("links the label to the control", () => {
    render(<Input label="Seu nome" />);
    expect(screen.getByLabelText("Seu nome")).toBeInTheDocument();
  });

  it("shows the hint when there is no error", () => {
    render(<Input label="Board" hint="Opcional" />);
    expect(screen.getByText("Opcional")).toBeInTheDocument();
  });

  it("replaces the hint with the error and flags aria-invalid", () => {
    render(<Input label="Board" hint="Opcional" error="ID inválido" />);
    expect(screen.getByText("ID inválido")).toBeInTheDocument();
    expect(screen.queryByText("Opcional")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Board")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("accepts typing", async () => {
    render(<Input label="Seu nome" />);
    const input = screen.getByLabelText("Seu nome");
    await userEvent.type(input, "Ana");
    expect(input).toHaveValue("Ana");
  });
});

describe("Select", () => {
  it("renders options and reports the chosen value", async () => {
    render(
      <Select label="Câmera" defaultValue="">
        <option value="">Padrão</option>
        <option value="cam-1">Logitech</option>
      </Select>,
    );
    const select = screen.getByLabelText("Câmera");
    await userEvent.selectOptions(select, "cam-1");
    expect(select).toHaveValue("cam-1");
  });
});

describe("ColorField", () => {
  it("keeps the picker and the hex input in sync", async () => {
    let value = "#6366f1";
    const { rerender } = render(
      <ColorField
        label="Primária"
        value={value}
        onChange={(next) => {
          value = next;
        }}
      />,
    );
    const hex = screen.getByLabelText("Primária hex");
    expect(hex).toHaveValue("#6366f1");

    await userEvent.clear(hex);
    await userEvent.type(hex, "#ff0000");
    rerender(
      <ColorField label="Primária" value="#ff0000" onChange={() => {}} />,
    );
    expect(screen.getByLabelText("Primária hex")).toHaveValue("#ff0000");
    expect(screen.getByLabelText("Primária seletor")).toHaveValue("#ff0000");
  });
});
