import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw, logError } = vi.hoisted(() => ({ queryRaw: vi.fn(), logError: vi.fn() }));

vi.mock("@calcom/prisma", () => ({
  prisma: { $queryRaw: queryRaw },
  default: { $queryRaw: queryRaw },
}));

vi.mock("@calcom/lib/logger", () => ({
  default: { getSubLogger: () => ({ error: logError }) },
}));

import { getEventTypesPublic } from "./getEventTypesPublic";

function buildEventType(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: "30 min",
    description: "**bold**",
    length: 30,
    slug: "30min",
    hidden: false,
    price: 0,
    currency: "usd",
    metadata: {},
    ...overrides,
  };
}

describe("getEventTypesPublic", () => {
  beforeEach(() => {
    queryRaw.mockReset();
    logError.mockReset();
  });

  it("passes the user id to the raw query", async () => {
    queryRaw.mockResolvedValue([]);
    await getEventTypesPublic(42);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.calls[0].slice(1)).toContain(42);
  });

  it("filters out hidden event types", async () => {
    queryRaw.mockResolvedValue([
      buildEventType({ id: 1, hidden: false }),
      buildEventType({ id: 2, hidden: true }),
    ]);

    const result = await getEventTypesPublic(1);
    expect(result.map((eventType) => eventType.id)).toEqual([1]);
  });

  it("renders the description as safe HTML", async () => {
    queryRaw.mockResolvedValue([buildEventType({ description: "**bold**" })]);

    const [eventType] = await getEventTypesPublic(1);
    expect(eventType.descriptionAsSafeHTML).toContain("<strong>bold</strong>");
  });

  it("keeps parsed metadata", async () => {
    queryRaw.mockResolvedValue([buildEventType({ metadata: { multipleDuration: [15, 30] } })]);

    const [eventType] = await getEventTypesPublic(1);
    expect(eventType.metadata).toMatchObject({ multipleDuration: [15, 30] });
  });

  it("treats null metadata as empty", async () => {
    queryRaw.mockResolvedValue([buildEventType({ metadata: null })]);

    const [eventType] = await getEventTypesPublic(1);
    expect(eventType.metadata).toEqual({});
  });

  it("drops event types with invalid metadata and logs the error", async () => {
    queryRaw.mockResolvedValue([
      buildEventType({ id: 1, metadata: { multipleDuration: "not-an-array" } }),
      buildEventType({ id: 2 }),
    ]);

    const result = await getEventTypesPublic(1);
    expect(result.map((eventType) => eventType.id)).toEqual([2]);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list when the user has no event types", async () => {
    queryRaw.mockResolvedValue([]);
    await expect(getEventTypesPublic(1)).resolves.toEqual([]);
  });
});
