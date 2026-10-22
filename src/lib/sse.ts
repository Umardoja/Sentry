"use client";
import { useEffect } from "react";
import type { StreamEvent } from "@/shared/schemas";
export function useSse(onEvent: (event: StreamEvent) => void) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_USE_FIXTURES === "1") return;
    const es = new EventSource("/api/stream");
    es.onmessage = (e) => onEvent(JSON.parse(e.data) as StreamEvent);
    return () => es.close();
  }, [onEvent]);
}
