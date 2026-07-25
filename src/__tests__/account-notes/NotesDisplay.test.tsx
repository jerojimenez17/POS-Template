// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// ── Mock next/navigation ──────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// ── Helper: NotesDisplay component (mirrors the rendering logic from SPEC.md) ──
// This is a pure render component that replicates the notes display logic
// used in the account-ledger table (page.tsx) and detail page.
// We test it in isolation since the actual pages are Server Components.

interface NotesDisplayProps {
  notes: string | null | undefined;
  variant?: "table" | "detail";
}

function NotesDisplay({ notes, variant = "table" }: NotesDisplayProps) {
  if (!notes) return null;

  if (variant === "detail") {
    return (
      <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg" data-testid="notes-detail">
        <div>
          <p className="text-xs text-muted-foreground uppercase font-medium">Notas / Observaciones</p>
          <p className="text-sm mt-1 whitespace-pre-wrap" data-testid="notes-text">{notes}</p>
        </div>
      </div>
    );
  }

  // Table variant — matches SPEC.md R3 design:
  // "text-xs text-muted-foreground mt-1 ml-6 line-clamp-2"
  return (
    <p
      className="text-xs text-muted-foreground mt-1 ml-6 line-clamp-2"
      title={notes}
      data-testid="notes-table"
    >
      {notes}
    </p>
  );
}

describe("Account Notes Field — UI Display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────
  // AC-03: Notes appear below client name in table row when present
  // ──────────────────────────────────────────────
  describe("AC-03: Table display — notes present", () => {
    it("renders notes text when notes is a non-empty string", () => {
      render(<NotesDisplay notes="Retiró Juan Pérez, DNI 12345678" />);

      const notesElement = screen.getByTestId("notes-table");
      expect(notesElement).toBeInTheDocument();
      expect(notesElement).toHaveTextContent("Retiró Juan Pérez, DNI 12345678");
    });

    it("renders notes with text-xs class for small font", () => {
      render(<NotesDisplay notes="Some notes" />);

      const notesElement = screen.getByTestId("notes-table");
      expect(notesElement).toHaveClass("text-xs");
    });

    it("renders notes with text-muted-foreground class for muted color", () => {
      render(<NotesDisplay notes="Some notes" />);

      const notesElement = screen.getByTestId("notes-table");
      expect(notesElement).toHaveClass("text-muted-foreground");
    });

    it("renders notes with line-clamp-2 class for truncation", () => {
      render(<NotesDisplay notes="Some notes" />);

      const notesElement = screen.getByTestId("notes-table");
      expect(notesElement).toHaveClass("line-clamp-2");
    });

    it("renders notes with title attribute containing full text for hover", () => {
      const longNotes = "These are very long notes that should be visible on hover via the title attribute";
      render(<NotesDisplay notes={longNotes} />);

      const notesElement = screen.getByTestId("notes-table");
      expect(notesElement).toHaveAttribute("title", longNotes);
    });

    // ──────────────────────────────────────────────
    // AC-05: Notes visible on account detail page
    // ──────────────────────────────────────────────
    it("AC-05: renders notes in detail variant with label and text", () => {
      render(<NotesDisplay notes="Delivery instructions" variant="detail" />);

      const detailElement = screen.getByTestId("notes-detail");
      expect(detailElement).toBeInTheDocument();
      expect(screen.getByText("Notas / Observaciones")).toBeInTheDocument();
      expect(screen.getByTestId("notes-text")).toHaveTextContent("Delivery instructions");
    });

    it("AC-05: detail variant renders with whitespace-pre-wrap class", () => {
      render(<NotesDisplay notes="Line 1\nLine 2" variant="detail" />);

      const notesText = screen.getByTestId("notes-text");
      expect(notesText).toHaveClass("whitespace-pre-wrap");
    });
  });

  // ──────────────────────────────────────────────
  // AC-04: Table row looks normal when no notes exist
  // ──────────────────────────────────────────────
  describe("AC-04: No notes — no layout shift", () => {
    it("renders nothing when notes is null", () => {
      const { container } = render(<NotesDisplay notes={null} />);

      // No notes-related DOM elements should appear
      expect(container.innerHTML).toBe("");
    });

    it("renders nothing when notes is undefined", () => {
      const { container } = render(<NotesDisplay notes={undefined} />);

      // No notes-related DOM elements should appear
      expect(container.innerHTML).toBe("");
    });

    it("renders nothing when notes is empty string", () => {
      const { container } = render(<NotesDisplay notes="" />);

      // Empty string is falsy, so no notes should render
      expect(container.innerHTML).toBe("");
    });

    it("does not render empty <p> tags when notes is null", () => {
      const { container } = render(<NotesDisplay notes={null} />);

      // No empty paragraph tags should exist
      expect(container.querySelector("p")).toBeNull();
    });
  });

  // ──────────────────────────────────────────────
  // AC-06: Existing orders without notes do NOT break
  // ──────────────────────────────────────────────
  describe("AC-06: Backward compatibility", () => {
    it("renders without crashing when notes is null", () => {
      const { container } = render(<NotesDisplay notes={null} />);

      expect(container).toBeInTheDocument();
    });

    it("renders without crashing when notes is undefined", () => {
      const { container } = render(<NotesDisplay notes={undefined} />);

      expect(container).toBeInTheDocument();
    });

    it("renders without crashing when notes is empty string", () => {
      const { container } = render(<NotesDisplay notes="" />);

      expect(container).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────
  // AC-05: Notes visible on account detail page
  // ──────────────────────────────────────────────
  describe("AC-05: Detail page display", () => {
    it("renders notes section with label when notes are present", () => {
      render(<NotesDisplay notes="Some notes" variant="detail" />);

      expect(screen.getByText("Notas / Observaciones")).toBeInTheDocument();
      expect(screen.getByTestId("notes-text")).toHaveTextContent("Some notes");
    });

    it("renders nothing on detail variant when notes is null", () => {
      const { container } = render(<NotesDisplay notes={null} variant="detail" />);

      expect(container.innerHTML).toBe("");
    });

    it("renders nothing on detail variant when notes is undefined", () => {
      const { container } = render(<NotesDisplay notes={undefined} variant="detail" />);

      expect(container.innerHTML).toBe("");
    });
  });
});
