// frontend/app/ui/Icon.test.tsx
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Icon } from "./Icon";

describe("Icon", () => {
  test("renders an svg sized by the size prop", () => {
    const { container } = render(<Icon name="play" size={18} />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("width", "18");
    expect(svg).toHaveAttribute("height", "18");
  });

  test("defaults to size 22 when no size is given", () => {
    const { container } = render(<Icon name="check" />);

    expect(container.querySelector("svg")).toHaveAttribute("width", "22");
  });

  test("is hidden from assistive tech, since it is always paired with visible text", () => {
    const { container } = render(<Icon name="check" />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
