export type RepositoryInvalidationReason =
  | "initialize"
  | "reset"
  | "import"
  | "mutation"
  | "persona"
  | "remote";

export interface RepositoryInvalidationEvent {
  revision: number;
  reason: RepositoryInvalidationReason;
  source: string;
  at: string;
}

type Listener = (event: RepositoryInvalidationEvent) => void;

export class RepositoryInvalidationBus {
  private revision = 0;
  private readonly source = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36);
  private readonly listeners = new Set<Listener>();
  private readonly channel: BroadcastChannel | null;

  constructor(channelName = "calricula-demo-data") {
    this.channel =
      typeof window === "undefined" || typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(channelName);
    this.channel?.addEventListener("message", this.handleRemoteMessage);
  }

  getRevision = (): number => this.revision;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  invalidate(reason: Exclude<RepositoryInvalidationReason, "remote">): void {
    const event = this.makeEvent(reason);
    this.emit(event);
    this.channel?.postMessage(event);
  }

  close(): void {
    this.channel?.removeEventListener("message", this.handleRemoteMessage);
    this.channel?.close();
    this.listeners.clear();
  }

  private readonly handleRemoteMessage = (message: MessageEvent<RepositoryInvalidationEvent>) => {
    if (!message.data || message.data.source === this.source) return;
    this.emit({ ...message.data, revision: this.revision + 1, reason: "remote" });
  };

  private makeEvent(reason: RepositoryInvalidationReason): RepositoryInvalidationEvent {
    return {
      revision: this.revision + 1,
      reason,
      source: this.source,
      at: new Date().toISOString(),
    };
  }

  private emit(event: RepositoryInvalidationEvent): void {
    this.revision = Math.max(this.revision + 1, event.revision);
    const emitted = { ...event, revision: this.revision };
    this.listeners.forEach((listener) => listener(emitted));
  }
}

export const repositoryInvalidation = new RepositoryInvalidationBus();
