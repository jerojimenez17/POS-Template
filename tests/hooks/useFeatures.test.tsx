import { renderHook } from "@testing-library/react";
import { useFeatures } from "@/hooks/useFeatures";
import { describe, it, expect, vi } from "vitest";
import { useSession } from "next-auth/react";
import { Plan, BusinessStatus } from "@prisma/client";

// Mock next-auth react hooks
vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe("useFeatures Client Hook Test Suite", () => {
  it("should return basic plan features if no session exists", () => {
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: "unauthenticated",
      update: vi.fn(),
    } as any);

    const { result } = renderHook(() => useFeatures());

    expect(result.current.plan).toBe(Plan.BASIC);
    expect(result.current.hasFeature("hasAfipBilling")).toBe(false);
    expect(result.current.isPlanAtLeast(Plan.PRO)).toBe(false);
  });

  it("should validate active toggles for Enterprise tier", () => {
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: {
          business: {
            accountStatus: BusinessStatus.ACTIVO,
            features: {
              plan: Plan.ENTERPRISE,
              hasAfipBilling: true,
              hasPublicCatalog: true,
              hasClientLedger: true,
              hasMultiCashbox: true,
              maxUsers: 9999,
              maxProducts: 99999,
            },
          },
        },
      },
      status: "authenticated",
      update: vi.fn(),
    } as any);

    const { result } = renderHook(() => useFeatures());

    expect(result.current.plan).toBe(Plan.ENTERPRISE);
    expect(result.current.hasFeature("hasAfipBilling")).toBe(true);
    expect(result.current.isPlanAtLeast(Plan.PRO)).toBe(true);
    expect(result.current.isPlanAtLeast(Plan.ENTERPRISE)).toBe(true);
  });

  it("should assert limits accurately", () => {
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: {
          business: {
            accountStatus: BusinessStatus.ACTIVO,
            features: {
              plan: Plan.PRO,
              maxProducts: 1000,
            },
          },
        },
      },
      status: "authenticated",
      update: vi.fn(),
    } as any);

    const { result } = renderHook(() => useFeatures());
    expect(result.current.isOverLimit("maxProducts", 999)).toBe(false);
    expect(result.current.isOverLimit("maxProducts", 1000)).toBe(true);
  });

  it("should detect delinquency status", () => {
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: {
          business: {
            accountStatus: BusinessStatus.MOROSO,
            features: { plan: Plan.BASIC },
          },
        },
      },
      status: "authenticated",
      update: vi.fn(),
    } as any);

    const { result } = renderHook(() => useFeatures());
    expect(result.current.isDelinquent).toBe(true);
  });
});
