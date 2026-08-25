import type { User } from "@calcom/prisma/client";
import { WatchlistAction, WatchlistSource, WatchlistType } from "@calcom/prisma/enums";
import { describe, expect, it } from "vitest";
import type { Watchlist } from "../types";
import {
  mapBlockingResultToDTO,
  mapWatchlistListToDTO,
  mapWatchlistToDTO,
  sanitizeWatchlistEntryDTO,
  sanitizeWatchlistValue,
} from "./mappers";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    name: "Admin",
    email: "admin@example.com",
    avatarUrl: "https://cal.com/avatar.png",
    ...overrides,
  } as User;
}

function makeWatchlist(overrides: Partial<Watchlist> = {}): Watchlist {
  return {
    id: "entry-1",
    type: WatchlistType.EMAIL,
    value: "spam@example.com",
    description: "bad actor",
    action: WatchlistAction.BLOCK,
    source: WatchlistSource.MANUAL,
    isGlobal: true,
    organizationId: null,
    lastUpdatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  } as Watchlist;
}

describe("mapWatchlistToDTO", () => {
  it("serializes the timestamp and nulls the missing relations", () => {
    const dto = mapWatchlistToDTO(makeWatchlist());

    expect(dto).toMatchObject({
      id: "entry-1",
      type: WatchlistType.EMAIL,
      value: "spam@example.com",
      lastUpdatedAt: "2024-01-01T00:00:00.000Z",
      createdBy: null,
      updatedBy: null,
    });
  });

  it("projects only the public fields of createdBy and updatedBy", () => {
    const dto = mapWatchlistToDTO({
      ...makeWatchlist(),
      createdBy: makeUser(),
      updatedBy: makeUser({ id: 2, name: "Owner", email: "owner@example.com" }),
    });

    expect(dto.createdBy).toEqual({
      id: 1,
      name: "Admin",
      email: "admin@example.com",
      avatarUrl: "https://cal.com/avatar.png",
    });
    expect(dto.updatedBy).toEqual({
      id: 2,
      name: "Owner",
      email: "owner@example.com",
      avatarUrl: "https://cal.com/avatar.png",
    });
  });
});

describe("mapWatchlistListToDTO", () => {
  it("omits pagination when it is not provided", () => {
    const result = mapWatchlistListToDTO([makeWatchlist()]);

    expect(result.entries).toHaveLength(1);
    expect(result.pagination).toBeUndefined();
  });

  it("computes hasMore when more pages remain", () => {
    const result = mapWatchlistListToDTO([makeWatchlist()], { total: 30, page: 1, limit: 10 });

    expect(result.pagination).toEqual({ total: 30, page: 1, limit: 10, hasMore: true });
  });

  it("computes hasMore as false on the last page", () => {
    const result = mapWatchlistListToDTO([], { total: 20, page: 2, limit: 10 });

    expect(result.pagination?.hasMore).toBe(false);
  });
});

describe("mapBlockingResultToDTO", () => {
  it("returns an undefined matchedEntry when nothing matched", () => {
    expect(mapBlockingResultToDTO({ isBlocked: false })).toEqual({
      isBlocked: false,
      reason: undefined,
      matchedEntry: undefined,
    });
  });

  it("projects the matched entry down to its identifying fields", () => {
    const entry = mapWatchlistToDTO(makeWatchlist());

    const result = mapBlockingResultToDTO({
      isBlocked: true,
      reason: WatchlistType.EMAIL,
      watchlistEntry: entry,
    });

    expect(result).toEqual({
      isBlocked: true,
      reason: WatchlistType.EMAIL,
      matchedEntry: {
        id: "entry-1",
        type: WatchlistType.EMAIL,
        value: "spam@example.com",
        action: WatchlistAction.BLOCK,
      },
    });
  });

  it("treats an explicitly null entry as no match", () => {
    expect(mapBlockingResultToDTO({ isBlocked: true, watchlistEntry: null }).matchedEntry).toBeUndefined();
  });
});

describe("sanitizeWatchlistEntryDTO", () => {
  it("hides emails of the related users while keeping other fields", () => {
    const dto = mapWatchlistToDTO({
      ...makeWatchlist(),
      createdBy: makeUser(),
      updatedBy: makeUser({ id: 2 }),
    });

    const sanitized = sanitizeWatchlistEntryDTO(dto);

    expect(sanitized.createdBy).toEqual({
      id: 1,
      name: "Admin",
      email: "",
      avatarUrl: dto.createdBy?.avatarUrl,
    });
    expect(sanitized.updatedBy?.email).toBe("");
    expect(sanitized.value).toBe(dto.value);
  });

  it("keeps null relations null", () => {
    const sanitized = sanitizeWatchlistEntryDTO(mapWatchlistToDTO(makeWatchlist()));

    expect(sanitized.createdBy).toBeNull();
    expect(sanitized.updatedBy).toBeNull();
  });
});

describe("sanitizeWatchlistValue", () => {
  it("normalizes emails", () => {
    expect(sanitizeWatchlistValue(WatchlistType.EMAIL, "  SPAM@Example.COM ")).toBe("spam@example.com");
  });

  it("normalizes domains", () => {
    expect(sanitizeWatchlistValue(WatchlistType.DOMAIN, " Example.COM ")).toBe("example.com");
  });

  it("normalizes usernames", () => {
    expect(sanitizeWatchlistValue(WatchlistType.USERNAME, "  SpamUser ")).toBe("spamuser");
  });

  it("falls back to trimming for unknown types", () => {
    expect(sanitizeWatchlistValue("IP" as WatchlistType, "  1.2.3.4 ")).toBe("1.2.3.4");
  });
});
