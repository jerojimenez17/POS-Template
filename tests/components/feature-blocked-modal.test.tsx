import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FeatureBlockedModal } from "@/components/ui/feature-blocked-modal";

describe("FeatureBlockedModal", () => {
  const onOpenChange = vi.fn();

  it("renders feature variant with lock icon and correct description", () => {
    render(
      <FeatureBlockedModal
        open={true}
        onOpenChange={onOpenChange}
        variant="feature"
        feature="Catálogo público"
      />
    );

    expect(screen.getByText("Funcionalidad no disponible")).toBeInTheDocument();
    expect(
      screen.getByText(/Catálogo público/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no está incluida en tu plan actual/)
    ).toBeInTheDocument();
  });

  it("renders limit variant with ban icon and correct description", () => {
    render(
      <FeatureBlockedModal
        open={true}
        onOpenChange={onOpenChange}
        variant="limit"
        resource="productos"
        limitValue={100}
      />
    );

    expect(screen.getByText("Límite del plan alcanzado")).toBeInTheDocument();
    expect(screen.getByText(/productos/)).toBeInTheDocument();
    expect(screen.getByText(/100/)).toBeInTheDocument();
    expect(
      screen.getByText(/Has superado el límite/)
    ).toBeInTheDocument();
  });

  it("shows Entendido button when showAcknowledge is true", () => {
    render(
      <FeatureBlockedModal
        open={true}
        onOpenChange={onOpenChange}
        variant="feature"
        feature="Catálogo público"
        showAcknowledge={true}
      />
    );

    expect(screen.getByText("Entendido")).toBeInTheDocument();
  });

  it("does not show Entendido button when showAcknowledge is false", () => {
    render(
      <FeatureBlockedModal
        open={true}
        onOpenChange={onOpenChange}
        variant="feature"
        feature="Catálogo público"
        showAcknowledge={false}
      />
    );

    expect(screen.queryByText("Entendido")).toBeNull();
  });

  it("renders WhatsApp link with correct href", () => {
    render(
      <FeatureBlockedModal
        open={true}
        onOpenChange={onOpenChange}
        variant="feature"
        feature="Catálogo público"
      />
    );

    const whatsappLink = screen.getByText("Contactar por WhatsApp").closest("a");
    expect(whatsappLink).toHaveAttribute(
      "href",
      "https://wa.me/5492265418113"
    );
    expect(whatsappLink).toHaveAttribute("target", "_blank");
    expect(whatsappLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not render dialog content when open is false", () => {
    render(
      <FeatureBlockedModal
        open={false}
        onOpenChange={onOpenChange}
        variant="feature"
        feature="Catálogo público"
      />
    );

    expect(screen.queryByText("Funcionalidad no disponible")).toBeNull();
    expect(screen.queryByText("Contactar por WhatsApp")).toBeNull();
  });
});
