import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Topbar } from "./Topbar";

test("Topbar renders title and handles toggle", () => {
  const toggle = jest.fn();
  render(<Topbar title="Dashboard" onToggleTheme={toggle} />);
  fireEvent.click(screen.getByRole("button", { name: "Theme" }));
  expect(toggle).toHaveBeenCalled();
  expect(screen.getByText("Dashboard")).toBeInTheDocument();
});

