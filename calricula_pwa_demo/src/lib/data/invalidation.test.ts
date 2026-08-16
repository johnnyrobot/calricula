import { afterEach, describe, expect, it } from "vitest";

import {
  RepositoryInvalidationBus,
  type RepositoryInvalidationEvent,
} from "./invalidation";

class TestBroadcastChannel {
  static channels = new Map<string, Set<TestBroadcastChannel>>();
  readonly listeners = new Set<(event: MessageEvent<RepositoryInvalidationEvent>) => void>();

  constructor(readonly name: string) {
    const channels = TestBroadcastChannel.channels.get(name) ?? new Set();
    channels.add(this);
    TestBroadcastChannel.channels.set(name, channels);
  }

  addEventListener(
    _type: "message",
    listener: (event: MessageEvent<RepositoryInvalidationEvent>) => void,
  ): void {
    this.listeners.add(listener);
  }

  removeEventListener(
    _type: "message",
    listener: (event: MessageEvent<RepositoryInvalidationEvent>) => void,
  ): void {
    this.listeners.delete(listener);
  }

  postMessage(data: RepositoryInvalidationEvent): void {
    TestBroadcastChannel.channels.get(this.name)?.forEach((channel) => {
      if (channel !== this) {
        channel.listeners.forEach((listener) =>
          listener({ data } as MessageEvent<RepositoryInvalidationEvent>),
        );
      }
    });
  }

  close(): void {
    TestBroadcastChannel.channels.get(this.name)?.delete(this);
  }
}

describe("RepositoryInvalidationBus", () => {
  const original = globalThis.BroadcastChannel;

  afterEach(() => {
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      value: original,
    });
    TestBroadcastChannel.channels.clear();
  });

  it("notifies local subscribers, supports unsubscribe, and closes cleanly", () => {
    const bus = new RepositoryInvalidationBus("local-only");
    const events: RepositoryInvalidationEvent[] = [];
    const unsubscribe = bus.subscribe((event) => events.push(event));
    bus.invalidate("mutation");
    expect(bus.getRevision()).toBe(1);
    expect(events[0]).toMatchObject({ reason: "mutation", revision: 1 });
    unsubscribe();
    bus.invalidate("persona");
    expect(events).toHaveLength(1);
    bus.close();
  });

  it("propagates invalidation between tabs through BroadcastChannel", () => {
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      value: TestBroadcastChannel,
    });
    const first = new RepositoryInvalidationBus("shared");
    const second = new RepositoryInvalidationBus("shared");
    const remote: RepositoryInvalidationEvent[] = [];
    second.subscribe((event) => remote.push(event));

    first.invalidate("reset");
    expect(remote).toHaveLength(1);
    expect(remote[0]).toMatchObject({ reason: "remote", revision: 1 });
    first.close();
    second.close();
  });
});
