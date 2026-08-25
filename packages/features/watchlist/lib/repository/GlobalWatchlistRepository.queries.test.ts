import type { PrismaClient } from "@calcom/prisma/client";
import { WatchlistAction, WatchlistSource, WatchlistType } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it } from "vitest";
import { type DeepMockProxy, mockDeep } from "vitest-mock-extended";
import { GlobalWatchlistRepository } from "./GlobalWatchlistRepository";

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    type: WatchlistType.EMAIL,
    value: "spam@example.com",
    description: null,
    isGlobal: true,
    organizationId: null,
    action: WatchlistAction.BLOCK,
    source: WatchlistSource.MANUAL,
    lastUpdatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("GlobalWatchlistRepository queries", () => {
  let prismaMock: DeepMockProxy<PrismaClient>;
  let repo: GlobalWatchlistRepository;

  beforeEach(() => {
    prismaMock = mockDeep<PrismaClient>();
    repo = new GlobalWatchlistRepository(prismaMock);
  });

  it("findBlockedEmail restricts to global BLOCK email entries", async () => {
    const entry = makeEntry();
    prismaMock.watchlist.findFirst.mockResolvedValue(entry as never);

    const result = await repo.findBlockedEmail("spam@example.com");

    expect(result).toEqual(entry);
    expect(prismaMock.watchlist.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: WatchlistType.EMAIL,
          value: "spam@example.com",
          action: WatchlistAction.BLOCK,
          organizationId: null,
          isGlobal: true,
        },
      })
    );
  });

  it("findBlockedDomain restricts to global BLOCK domain entries", async () => {
    prismaMock.watchlist.findFirst.mockResolvedValue(null as never);

    await expect(repo.findBlockedDomain("example.com")).resolves.toBeNull();
    expect(prismaMock.watchlist.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: WatchlistType.DOMAIN,
          value: "example.com",
          action: WatchlistAction.BLOCK,
        }),
      })
    );
  });

  it("findFreeEmailDomain filters on the FREE_DOMAIN_POLICY source", async () => {
    prismaMock.watchlist.findFirst.mockResolvedValue(makeEntry({ type: WatchlistType.DOMAIN }) as never);

    const result = await repo.findFreeEmailDomain("gmail.com");

    expect(result).not.toBeNull();
    expect(prismaMock.watchlist.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: WatchlistSource.FREE_DOMAIN_POLICY }),
      })
    );
  });

  it("findById only matches global entries", async () => {
    prismaMock.watchlist.findFirst.mockResolvedValue(null as never);

    await repo.findById("entry-1");

    expect(prismaMock.watchlist.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "entry-1", organizationId: null, isGlobal: true } })
    );
  });

  it("listBlockedEntries returns all global BLOCK entries", async () => {
    prismaMock.watchlist.findMany.mockResolvedValue([makeEntry()] as never);

    const result = await repo.listBlockedEntries();

    expect(result).toHaveLength(1);
    expect(prismaMock.watchlist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: null, isGlobal: true, action: WatchlistAction.BLOCK },
      })
    );
  });

  describe("findBlockingEntriesForEmailsAndDomains", () => {
    it("skips the query when there is nothing to look up", async () => {
      const result = await repo.findBlockingEntriesForEmailsAndDomains({ emails: [], domains: [] });

      expect(result).toEqual([]);
      expect(prismaMock.watchlist.findMany).not.toHaveBeenCalled();
    });

    it("queries domains only when no emails are given", async () => {
      prismaMock.watchlist.findMany.mockResolvedValue([] as never);

      await repo.findBlockingEntriesForEmailsAndDomains({ emails: [], domains: ["example.com"] });

      expect(prismaMock.watchlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ type: WatchlistType.DOMAIN, value: { in: ["example.com"] } }],
          }),
        })
      );
    });

    it("queries emails and domains together", async () => {
      prismaMock.watchlist.findMany.mockResolvedValue([makeEntry()] as never);

      const result = await repo.findBlockingEntriesForEmailsAndDomains({
        emails: ["spam@example.com"],
        domains: ["example.com", "*.example.com"],
      });

      expect(result).toHaveLength(1);
      expect(prismaMock.watchlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isGlobal: true,
            organizationId: null,
            action: WatchlistAction.BLOCK,
            OR: [
              { type: WatchlistType.EMAIL, value: { in: ["spam@example.com"] } },
              { type: WatchlistType.DOMAIN, value: { in: ["example.com", "*.example.com"] } },
            ],
          }),
        })
      );
    });
  });

  describe("updateEntry", () => {
    it("only updates the provided fields", async () => {
      prismaMock.watchlist.update.mockResolvedValue(makeEntry() as never);

      await repo.updateEntry("entry-1", { value: "new@example.com" });

      expect(prismaMock.watchlist.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "entry-1" }, data: { value: "new@example.com" } })
      );
    });

    it("supports clearing the description and switching action and source", async () => {
      prismaMock.watchlist.update.mockResolvedValue(makeEntry() as never);

      await repo.updateEntry("entry-1", {
        description: null,
        action: WatchlistAction.ALERT,
        source: WatchlistSource.SIGNUP,
      });

      expect(prismaMock.watchlist.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            description: null,
            action: WatchlistAction.ALERT,
            source: WatchlistSource.SIGNUP,
          },
        })
      );
    });

    it("sends an empty data object when nothing changes", async () => {
      prismaMock.watchlist.update.mockResolvedValue(makeEntry() as never);

      await repo.updateEntry("entry-1", {});

      expect(prismaMock.watchlist.update).toHaveBeenCalledWith(expect.objectContaining({ data: {} }));
    });
  });
});
