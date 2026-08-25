import type { PrismaClient } from "@calcom/prisma/client";
import { WatchlistAction, WatchlistSource, WatchlistType } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it } from "vitest";
import { type DeepMockProxy, mockDeep } from "vitest-mock-extended";
import { OrganizationWatchlistRepository } from "./OrganizationWatchlistRepository";

const ORG_ID = 42;

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    type: WatchlistType.EMAIL,
    value: "spam@example.com",
    description: null,
    isGlobal: false,
    organizationId: ORG_ID,
    action: WatchlistAction.BLOCK,
    source: WatchlistSource.MANUAL,
    lastUpdatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("OrganizationWatchlistRepository", () => {
  let prismaMock: DeepMockProxy<PrismaClient>;
  let repo: OrganizationWatchlistRepository;

  beforeEach(() => {
    prismaMock = mockDeep<PrismaClient>();
    repo = new OrganizationWatchlistRepository(prismaMock);
  });

  it("findBlockedEmail scopes the query to the organization", async () => {
    const entry = makeEntry();
    prismaMock.watchlist.findFirst.mockResolvedValue(entry as never);

    const result = await repo.findBlockedEmail({ email: "spam@example.com", organizationId: ORG_ID });

    expect(result).toEqual(entry);
    expect(prismaMock.watchlist.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: WatchlistType.EMAIL,
          value: "spam@example.com",
          action: WatchlistAction.BLOCK,
          organizationId: ORG_ID,
        },
      })
    );
  });

  it("findBlockedDomain returns null when nothing matches", async () => {
    prismaMock.watchlist.findFirst.mockResolvedValue(null as never);

    const result = await repo.findBlockedDomain("example.com", ORG_ID);

    expect(result).toBeNull();
    expect(prismaMock.watchlist.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: WatchlistType.DOMAIN, value: "example.com" }),
      })
    );
  });

  it("listBlockedEntries only returns BLOCK entries for the organization", async () => {
    prismaMock.watchlist.findMany.mockResolvedValue([makeEntry()] as never);

    const result = await repo.listBlockedEntries(ORG_ID);

    expect(result).toHaveLength(1);
    expect(prismaMock.watchlist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG_ID, action: WatchlistAction.BLOCK },
      })
    );
  });

  it("listAllOrganizationEntries excludes global entries", async () => {
    prismaMock.watchlist.findMany.mockResolvedValue([] as never);

    await repo.listAllOrganizationEntries();

    expect(prismaMock.watchlist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: { not: null },
          isGlobal: false,
          action: WatchlistAction.BLOCK,
        },
      })
    );
  });

  describe("findBlockingEntriesForEmailsAndDomains", () => {
    it("returns early without querying when both lists are empty", async () => {
      const result = await repo.findBlockingEntriesForEmailsAndDomains({
        emails: [],
        domains: [],
        organizationId: ORG_ID,
      });

      expect(result).toEqual([]);
      expect(prismaMock.watchlist.findMany).not.toHaveBeenCalled();
    });

    it("builds an OR condition for emails only", async () => {
      prismaMock.watchlist.findMany.mockResolvedValue([] as never);

      await repo.findBlockingEntriesForEmailsAndDomains({
        emails: ["a@example.com"],
        domains: [],
        organizationId: ORG_ID,
      });

      expect(prismaMock.watchlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ type: WatchlistType.EMAIL, value: { in: ["a@example.com"] } }],
          }),
        })
      );
    });

    it("builds an OR condition for both emails and domains", async () => {
      prismaMock.watchlist.findMany.mockResolvedValue([makeEntry()] as never);

      const result = await repo.findBlockingEntriesForEmailsAndDomains({
        emails: ["a@example.com"],
        domains: ["example.com", "*.example.com"],
        organizationId: ORG_ID,
      });

      expect(result).toHaveLength(1);
      expect(prismaMock.watchlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_ID,
            action: WatchlistAction.BLOCK,
            OR: [
              { type: WatchlistType.EMAIL, value: { in: ["a@example.com"] } },
              { type: WatchlistType.DOMAIN, value: { in: ["example.com", "*.example.com"] } },
            ],
          }),
        })
      );
    });
  });

  it("findById scopes the lookup to the organization", async () => {
    prismaMock.watchlist.findFirst.mockResolvedValue(null as never);

    await repo.findById("entry-1", ORG_ID);

    expect(prismaMock.watchlist.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "entry-1", organizationId: ORG_ID } })
    );
  });

  describe("createEntry", () => {
    it("creates a non-global entry defaulting to the MANUAL source", async () => {
      prismaMock.watchlist.create.mockResolvedValue(makeEntry() as never);

      await repo.createEntry(ORG_ID, {
        type: WatchlistType.EMAIL,
        value: "spam@example.com",
        action: WatchlistAction.BLOCK,
      });

      expect(prismaMock.watchlist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isGlobal: false,
            organizationId: ORG_ID,
            source: WatchlistSource.MANUAL,
          }),
        })
      );
    });

    it("keeps an explicitly provided source", async () => {
      prismaMock.watchlist.create.mockResolvedValue(makeEntry() as never);

      await repo.createEntry(ORG_ID, {
        type: WatchlistType.DOMAIN,
        value: "example.com",
        action: WatchlistAction.BLOCK,
        source: WatchlistSource.SIGNUP,
      });

      expect(prismaMock.watchlist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ source: WatchlistSource.SIGNUP }),
        })
      );
    });
  });

  describe("updateEntry", () => {
    it("only sends the provided fields", async () => {
      prismaMock.watchlist.update.mockResolvedValue(makeEntry() as never);

      await repo.updateEntry("entry-1", ORG_ID, { value: "new@example.com" });

      expect(prismaMock.watchlist.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "entry-1", organizationId: ORG_ID },
          data: { value: "new@example.com" },
        })
      );
    });

    it("supports clearing the description and changing action and source", async () => {
      prismaMock.watchlist.update.mockResolvedValue(makeEntry() as never);

      await repo.updateEntry("entry-1", ORG_ID, {
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
  });

  it("deleteEntry resolves to undefined", async () => {
    prismaMock.watchlist.delete.mockResolvedValue(makeEntry() as never);

    await expect(repo.deleteEntry("entry-1", ORG_ID)).resolves.toBeUndefined();
    expect(prismaMock.watchlist.delete).toHaveBeenCalledWith({
      where: { id: "entry-1", organizationId: ORG_ID },
    });
  });
});
