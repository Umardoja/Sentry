import "server-only";
import type { StreamEvent } from "@/shared/schemas";
type Listener = (event: StreamEvent) => void;
class Bus {
  private id = 0;
  private listeners = new Set<Listener>();
  publish(type: StreamEvent["type"], sim_ts: string, data: Record<string, unknown>) {
    const event: StreamEvent = { type, id: ++this.id, sim_ts, data };
    this.listeners.forEach((listener) => listener(event));
    return event;
  }
  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
import { currentWorkspaceId } from "./services/workspace";
const globalBus = globalThis as unknown as { sentryBuses?: Map<string, Bus> };
const bus = () => {
  const buses = (globalBus.sentryBuses ??= new Map());
  const key = currentWorkspaceId() ?? "default";
  let selected = buses.get(key);
  if (!selected) { selected = new Bus(); buses.set(key, selected); }
  return selected;
};
export const events = {
  publish: (type: StreamEvent["type"], sim_ts: string, data: Record<string, unknown>) => bus().publish(type, sim_ts, data),
  subscribe: (listener: Listener) => bus().subscribe(listener),
};
