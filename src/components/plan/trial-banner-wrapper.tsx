"use client";

import dynamic from "next/dynamic";

/**
 * Client wrapper for TrialBanner — needed because (protected)/layout.tsx is a Server Component.
 */
const TrialBannerInner = dynamic(
  () => import("./trial-banner").then((m) => ({ default: m.TrialBanner })),
  { ssr: false }
);

export const TrialBannerWrapper = () => {
  return <TrialBannerInner />;
};
