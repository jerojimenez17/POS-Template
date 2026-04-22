"use client";

import { useEffect } from "react";

interface UseSalesPusherOptions {
  businessId: string | null;
  onNewOrder: () => void;
}

export function useSalesPusher({ businessId, onNewOrder }: UseSalesPusherOptions) {
  useEffect(() => {
    if (!businessId || typeof window === "undefined") return;

    let channelName = "";

    const setupPusher = async () => {
      const { pusherClient } = await import("@/lib/pusher-client");

      channelName = `orders-${businessId}`;
      const channel = pusherClient.subscribe(channelName);

      channel.bind("orders-update", onNewOrder);
    };

    setupPusher();

    return () => {
      if (channelName) {
        import("@/lib/pusher-client").then(({ pusherClient }) => {
          pusherClient.unsubscribe(channelName);
        });
      }
    };
  }, [businessId, onNewOrder]);
}