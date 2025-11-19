import React from "react";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card";

test("Card renders title", () => {
  render(<Card title="Stats">Body</Card>);
  expect(screen.getByText("Stats")).toBeInTheDocument();
  expect(screen.getByText("Body")).toBeInTheDocument();
});

