import React from "react";
import { render, screen } from "@testing-library/react";
import { Modal } from "./Modal";

jest.mock("react-dom", () => ({
  ...jest.requireActual("react-dom"),
  createPortal: (node: React.ReactNode) => node
}));

test("Modal renders content when open", () => {
  render(<Modal open onClose={()=>{}} title="Modal Title">Content</Modal>);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText("Content")).toBeInTheDocument();
});

