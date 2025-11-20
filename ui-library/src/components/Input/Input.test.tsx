import React from "react";
import { render, screen } from "@testing-library/react";
import { Input } from "./Input";

test("Input renders placeholder", () => {
  render(<Input placeholder="Type here" />);
  expect(screen.getByPlaceholderText("Type here")).toBeInTheDocument();
});

