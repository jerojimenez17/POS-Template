import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RootMenu from "@/components/ui/RootMenu";

(globalThis as unknown as { React: typeof React }).React = React;

// Mock next-auth
vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

import { useSession } from "next-auth/react";

// Mock MenuCard since we just want to verify it receives the correct props
vi.mock("@/components/ui/MenuCard", () => ({
  __esModule: true,
  default: ({ title, url }: { title: string, url: string }) => (
    <div data-testid={`menu-card-${title}`} data-url={url}>
      {title}
    </div>
  ),
}));

describe("RootMenu Test Cases", () => {
  it("should NOT render Usuarios card when user is not ADMIN", () => {
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: { 
          role: "USER", 
          businessSlug: "test-slug",
          businessId: null,
          businessName: null,
        },
        expires: new Date().toISOString(),
      },
      status: "authenticated",
      update: vi.fn(),
    } as any);

    render(<RootMenu />);
    
    expect(screen.queryByTestId("menu-card-Usuarios")).toBeNull();
  });

  it("should render Usuarios card when user is ADMIN", () => {
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: { 
          role: "ADMIN", 
          businessSlug: "test-slug",
          businessId: null,
          businessName: null,
        },
        expires: new Date().toISOString(),
      },
      status: "authenticated",
      update: vi.fn(),
    } as any);

    render(<RootMenu />);
    
    const adminCard = screen.getByTestId("menu-card-Usuarios");
    expect(adminCard).not.toBeNull();
    expect(adminCard.getAttribute("data-url")).toBe("/admin/users");
  });
});
