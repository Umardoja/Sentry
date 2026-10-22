import { events } from "@/server/events";
import { withRead } from "@/server/auth/request";
import { handle } from "@/server/services/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return handle(() => withRead(request, "READ_INVESTIGATIONS", () => {
  const encoder = new TextEncoder();
  let stop = () => {};
  let timer: ReturnType<typeof setInterval> | undefined;
  const close = () => {
    if (timer) clearInterval(timer);
    stop();
  };
  const stream = new ReadableStream({
    start(controller) {
      timer = setInterval(() => controller.enqueue(encoder.encode(": heartbeat\n\n")), 15000);
      stop = events.subscribe((event) =>
        controller.enqueue(
          encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
        ),
      );
      controller.enqueue(encoder.encode(": connected\n\n"));
      request.signal.addEventListener("abort", () => {
        close();
        controller.close();
      }, { once: true });
    },
    cancel() {
      close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
  }));
}
