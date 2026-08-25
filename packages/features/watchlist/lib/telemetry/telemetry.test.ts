import { beforeEach, describe, expect, it, vi } from "vitest";
import { noOpSpan } from "./no-op-span";
import { sentrySpan } from "./sentry-span";

const startSpan = vi.hoisted(() => vi.fn());

vi.mock("@sentry/nextjs", () => ({ startSpan }));

describe("noOpSpan", () => {
  it("resolves the callback result", async () => {
    await expect(noOpSpan({ name: "op" }, () => 42)).resolves.toBe(42);
  });

  it("awaits async callbacks", async () => {
    await expect(noOpSpan({ name: "op", op: "db" }, async () => "done")).resolves.toBe("done");
  });

  it("propagates callback errors", async () => {
    await expect(
      noOpSpan({ name: "op" }, () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });
});

describe("sentrySpan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startSpan.mockImplementation((_options: unknown, callback: () => unknown) => callback());
  });

  it("forwards the span name and op to Sentry and returns the callback result", async () => {
    await expect(sentrySpan({ name: "watchlist.check", op: "db.query" }, () => "ok")).resolves.toBe("ok");

    expect(startSpan).toHaveBeenCalledWith({ name: "watchlist.check", op: "db.query" }, expect.any(Function));
  });

  it("passes an undefined op when none is given", async () => {
    await sentrySpan({ name: "watchlist.check" }, () => null);

    expect(startSpan).toHaveBeenCalledWith({ name: "watchlist.check", op: undefined }, expect.any(Function));
  });
});
