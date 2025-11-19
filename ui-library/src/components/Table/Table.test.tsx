import React from "react";
import { render, screen } from "@testing-library/react";
import { Table } from "./Table";

test("Table renders columns and rows", () => {
  render(<Table columns={["Name"]} rows={[<td key="1">Alpha</td>]} />);
  expect(screen.getByText("Name")).toBeInTheDocument();
  expect(screen.getByText("Alpha")).toBeInTheDocument();
});

