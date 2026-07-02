import { create } from "zustand";

interface DelinquentState {
  /** True when the business accountStatus === "MOROSO" */
  isDelinquent: boolean;
  /** True when the blocker should be visible (mirrors isDelinquent) */
  showBlocker: boolean;

  /** Set both isDelinquent and showBlocker */
  setDelinquent: (status: boolean) => void;
  /** Force show the blocker (called by interceptor) */
  triggerBlocker: () => void;
}

export const useDelinquentStore = create<DelinquentState>((set) => ({
  isDelinquent: false,
  showBlocker: false,

  setDelinquent: (status) =>
    set({ isDelinquent: status, showBlocker: status }),

  triggerBlocker: () =>
    set({ isDelinquent: true, showBlocker: true }),
}));
