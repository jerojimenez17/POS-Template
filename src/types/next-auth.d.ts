import { UserRole, Plan, BusinessStatus } from "@prisma/client";
import { type DefaultSession } from "next-auth";

export type ExtendedUser = DefaultSession["user"] & {
  role: UserRole;
  businessId: string | null;
  cashboxId?: string | null;
  businessName: string | null;
  businessSlug: string | null;
  business: {
    name: string;
    slug: string;
    accountStatus: BusinessStatus;
    features: {
      plan: Plan;
      hasAfipBilling: boolean;
      hasPublicCatalog: boolean;
      hasClientLedger: boolean;
      hasMultiCashbox: boolean;
      hasSupplierFilter: boolean;
      hasBudget: boolean;
      hasNegativeStock: boolean;
      maxUsers: number;
      maxProducts: number;
    };
  } | null;
};

declare module "next-auth" {
  interface Session {
    user: ExtendedUser;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    businessId?: string | null;
    businessName?: string | null;
    businessSlug?: string | null;
    business?: ExtendedUser["business"];
  }
}
