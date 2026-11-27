import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RootMenu from "@/components/ui/RootMenu";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: "USER", businessId: "business-a", businessSlug: "store-a" } } }),
}));
vi.mock("@/components/ui/MenuCard", () => ({
  default: ({ title, url }: { title: string; url: string }) => <a href={url}>{title}</a>,
}));

describe("client page UI contract", () => {
  it("adds an absolute /clients entry to RootMenu without a business identifier", () => {
    render(<RootMenu />);
    const link = screen.getByRole("link", { name: "Clientes" });
    expect(link).toHaveAttribute("href", "/clients");
    expect(link.getAttribute("href")).not.toContain("business-a");
  });

  it("renders the client page with an actionable empty state and accessible search", async () => {
    const modulePath = "@/components/clients/ClientsPageClient";
    const clientsPage = (await import(modulePath)) as {
      default: React.ComponentType<{ clients: unknown[] }>;
    };
    render(<clientsPage.default clients={[]} />);
    expect(screen.getByText(/crear cliente/i)).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });
});
