"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { pusherClient } from "@/lib/pusher-client";

interface Props {
  businessId: string;
}

export function PusherListener({ businessId }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!businessId) return;

    const channelName = `orders-${businessId}`;
    const channel = pusherClient.subscribe(channelName);

    const handleUpdate = () => {
      // Refreshes the active page causing server components to refetch
      router.refresh();
    };

    channel.bind("orders-update", handleUpdate);

    return () => {
      channel.unbind("orders-update", handleUpdate);
    };
  }, [businessId, router]);

  return null;
}
