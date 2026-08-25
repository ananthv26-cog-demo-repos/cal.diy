import type { PrismaClient } from "@calcom/prisma";
import { WatchlistAction, WatchlistSource, WatchlistType } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it } from "vitest";
import { type DeepMockProxy, mockDeep } from "vitest-mock-extended";
import { WatchlistRepository } from "./WatchlistRepository";

type TransactionCallback = (tx: PrismaClient) => Promise<unknown>;

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    type: WatchlistType.EMAIL,
    value: "spam@example.com",
    action: WatchlistAction.BLOCK,
    description: null,
    organizationId: null,
    isGlobal: true,
    source: WatchlistSource.MANUAL,
    lastUpdatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("WatchlistRepository", () => {
  let prismaMock: DeepMockProxy<PrismaClient>;
  let repo: WatchlistRepository;

  beforeEach(() => {
    prismaMock = mockDeep<PrismaClient>();
    prismaMock.$transaction.mockImplementation((callback) => (callback as TransactionCallback)(prismaMock));
    repo = new WatchlistRepository(prismaMock);
  });

  describe("createEntry", () => {
    it("creates the entry and an audit row inside one transaction", async () => {
      const created = makeEntry({ id: "created-1" });
      prismaMock.watchlist.create.mockResolvedValue(created as never);

      const result = await repo.createEntry({
        type: WatchlistType.EMAIL,
        value: "spam@example.com",
        organizationId: null,
        action: WatchlistAction.BLOCK,
        description: "spammer",
        userId: 7,
        isGlobal: true,
      });

      expect(result).toEqual(created);
      expect(prismaMock.watchlist.create).toHaveBeenCalledWith({
        data: {
          type: WatchlistType.EMAIL,
          value: "spam@example.com",
          organizationId: null,
          action: WatchlistAction.BLOCK,
          description: "spammer",
          source: WatchlistSource.MANUAL,
          isGlobal: true,
        },
      });
      expect(prismaMock.watchlistAudit.create).toHaveBeenCalledWith({
        data: {
          watchlistId: "created-1",
          type: WatchlistType.EMAIL,
          value: "spam@example.com",
          description: "spammer",
          action: WatchlistAction.BLOCK,
          changedByUserId: 7,
        },
      });
    });

    it("defaults isGlobal to false when not provided", async () => {
      prismaMock.watchlist.create.mockResolvedValue(makeEntry() as never);

      await repo.createEntry({
        type: WatchlistType.DOMAIN,
        value: "example.com",
        organizationId: 5,
        action: WatchlistAction.BLOCK,
        userId: 1,
      });

      expect(prismaMock.watchlist.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isGlobal: false }) })
      );
    });
  });

  describe("createEntryIfNotExists", () => {
    it("returns the existing entry without creating a new one", async () => {
      const existing = makeEntry({ id: "existing-1" });
      prismaMock.watchlist.findFirst.mockResolvedValue(existing as never);

      const result = await repo.createEntryIfNotExists({
        type: WatchlistType.EMAIL,
        value: "spam@example.com",
        organizationId: null,
        isGlobal: true,
        action: WatchlistAction.BLOCK,
        userId: 1,
      });

      expect(result).toEqual(existing);
      expect(prismaMock.watchlist.create).not.toHaveBeenCalled();
    });

    it("creates the entry when it does not exist yet", async () => {
      prismaMock.watchlist.findUnique.mockResolvedValue(null as never);
      const created = makeEntry({ id: "created-2", organizationId: 3, isGlobal: false });
      prismaMock.watchlist.create.mockResolvedValue(created as never);

      const result = await repo.createEntryIfNotExists({
        type: WatchlistType.EMAIL,
        value: "spam@example.com",
        organizationId: 3,
        action: WatchlistAction.BLOCK,
        userId: 1,
      });

      expect(result).toEqual(created);
      expect(prismaMock.watchlist.create).toHaveBeenCalled();
    });
  });

  describe("checkExists", () => {
    it("throws when neither isGlobal nor organizationId is provided", async () => {
      await expect(
        repo.checkExists({ type: WatchlistType.EMAIL, value: "spam@example.com" })
      ).rejects.toThrow("Both isGlobal and organizationId are missing");
    });

    it("looks up global entries with findFirst", async () => {
      const entry = makeEntry();
      prismaMock.watchlist.findFirst.mockResolvedValue(entry as never);

      const result = await repo.checkExists({
        type: WatchlistType.EMAIL,
        value: "spam@example.com",
        isGlobal: true,
      });

      expect(result).toEqual(entry);
      expect(prismaMock.watchlist.findFirst).toHaveBeenCalledWith({
        where: {
          type: WatchlistType.EMAIL,
          value: "spam@example.com",
          isGlobal: true,
          organizationId: null,
        },
      });
    });

    it("looks up organization entries with the compound unique key", async () => {
      prismaMock.watchlist.findUnique.mockResolvedValue(null as never);

      const result = await repo.checkExists({
        type: WatchlistType.DOMAIN,
        value: "example.com",
        organizationId: 42,
      });

      expect(result).toBeNull();
      expect(prismaMock.watchlist.findUnique).toHaveBeenCalledWith({
        where: {
          type_value_organizationId: {
            type: WatchlistType.DOMAIN,
            value: "example.com",
            organizationId: 42,
          },
        },
      });
    });
  });

  describe("findAllEntriesWithLatestAudit", () => {
    it("flattens the latest audit and returns the total count", async () => {
      prismaMock.watchlist.findMany.mockResolvedValue([
        makeEntry({ id: "a", audits: [{ changedByUserId: 9 }] }),
        makeEntry({ id: "b", audits: [] }),
      ] as never);
      prismaMock.watchlist.count.mockResolvedValue(2 as never);

      const result = await repo.findAllEntriesWithLatestAudit({
        organizationId: null,
        isGlobal: true,
        limit: 10,
        offset: 0,
      });

      expect(result.meta).toEqual({ totalRowCount: 2 });
      expect(result.rows[0].latestAudit).toEqual({ changedByUserId: 9 });
      expect(result.rows[1].latestAudit).toBeNull();
      expect(result.rows[0]).toHaveProperty("audits", undefined);
    });

    it("applies search term and filters to the where clause", async () => {
      prismaMock.watchlist.findMany.mockResolvedValue([] as never);
      prismaMock.watchlist.count.mockResolvedValue(0 as never);

      await repo.findAllEntriesWithLatestAudit({
        organizationId: 3,
        isGlobal: false,
        limit: 5,
        offset: 10,
        searchTerm: "spam",
        filters: { type: WatchlistType.EMAIL, source: WatchlistSource.SIGNUP },
      });

      const expectedWhere = {
        organizationId: 3,
        isGlobal: false,
        value: { contains: "spam", mode: "insensitive" },
        type: WatchlistType.EMAIL,
        source: WatchlistSource.SIGNUP,
      };
      expect(prismaMock.watchlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere, take: 5, skip: 10 })
      );
      expect(prismaMock.watchlist.count).toHaveBeenCalledWith({ where: expectedWhere });
    });
  });

  describe("findEntryWithAuditAndReports", () => {
    it("merges org and global booking reports and returns the audit history", async () => {
      const audit = {
        id: "audit-1",
        watchlistId: "entry-1",
        type: WatchlistType.EMAIL,
        value: "spam@example.com",
        description: null,
        action: WatchlistAction.BLOCK,
        changedByUserId: 4,
        changedAt: new Date("2024-02-01T00:00:00.000Z"),
      };
      prismaMock.watchlist.findUnique.mockResolvedValue(
        makeEntry({
          description: undefined,
          organizationId: undefined,
          bookingReports: [{ booking: { uid: "uid-1", title: "One" } }],
          globalBookingReports: [{ booking: { uid: "uid-2", title: null } }],
          audits: [audit],
        }) as never
      );

      const result = await repo.findEntryWithAuditAndReports("entry-1");

      expect(result.entry?.bookingReports).toEqual([
        { booking: { uid: "uid-1", title: "One" } },
        { booking: { uid: "uid-2", title: null } },
      ]);
      expect(result.entry?.description).toBeNull();
      expect(result.entry?.organizationId).toBeNull();
      expect(result.auditHistory).toEqual([audit]);
    });

    it("returns a null entry and empty history when not found", async () => {
      prismaMock.watchlist.findUnique.mockResolvedValue(null as never);

      const result = await repo.findEntryWithAuditAndReports("missing");

      expect(result.entry).toBeNull();
      expect(result.auditHistory).toEqual([]);
    });
  });

  describe("findEntriesByIds", () => {
    it("queries the given ids", async () => {
      const rows = [{ id: "a", isGlobal: true, organizationId: null }];
      prismaMock.watchlist.findMany.mockResolvedValue(rows as never);

      const result = await repo.findEntriesByIds(["a", "b"]);

      expect(result).toEqual(rows);
      expect(prismaMock.watchlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ["a", "b"] } } })
      );
    });
  });

  describe("deleteEntry", () => {
    it("writes an audit row before deleting", async () => {
      prismaMock.watchlist.findUnique.mockResolvedValue(makeEntry() as never);

      await repo.deleteEntry("entry-1", 11);

      expect(prismaMock.watchlistAudit.create).toHaveBeenCalledWith({
        data: {
          watchlistId: "entry-1",
          type: WatchlistType.EMAIL,
          value: "spam@example.com",
          description: null,
          action: WatchlistAction.BLOCK,
          changedByUserId: 11,
        },
      });
      expect(prismaMock.watchlist.delete).toHaveBeenCalledWith({ where: { id: "entry-1" } });
    });

    it("throws when the entry does not exist", async () => {
      prismaMock.watchlist.findUnique.mockResolvedValue(null as never);

      await expect(repo.deleteEntry("missing", 1)).rejects.toThrow("Watchlist entry not found");
      expect(prismaMock.watchlist.delete).not.toHaveBeenCalled();
    });
  });

  describe("bulkDeleteEntries", () => {
    it("returns zero and skips the transaction when nothing matches", async () => {
      prismaMock.watchlist.findMany.mockResolvedValue([] as never);

      const result = await repo.bulkDeleteEntries({ ids: ["a"], userId: 1 });

      expect(result).toEqual({ deleted: 0 });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("audits and deletes every matched entry", async () => {
      prismaMock.watchlist.findMany.mockResolvedValue([
        makeEntry({ id: "a" }),
        makeEntry({ id: "b", value: "other@example.com" }),
      ] as never);

      const result = await repo.bulkDeleteEntries({ ids: ["a", "b"], userId: 3 });

      expect(result).toEqual({ deleted: 2 });
      expect(prismaMock.watchlistAudit.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ watchlistId: "a", changedByUserId: 3 }),
          expect.objectContaining({ watchlistId: "b", changedByUserId: 3 }),
        ],
      });
      expect(prismaMock.watchlist.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["a", "b"] } },
      });
    });
  });

  describe("createEntryFromReport", () => {
    it("creates a BLOCK entry if it does not exist and echoes the value", async () => {
      prismaMock.watchlist.findFirst.mockResolvedValue(null as never);
      const created = makeEntry({ id: "from-report" });
      prismaMock.watchlist.create.mockResolvedValue(created as never);

      const result = await repo.createEntryFromReport({
        type: WatchlistType.EMAIL,
        value: "spam@example.com",
        organizationId: null,
        isGlobal: true,
        userId: 2,
        description: "reported",
      });

      expect(result).toEqual({ watchlistEntry: created, value: "spam@example.com" });
      expect(prismaMock.watchlist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: WatchlistAction.BLOCK, description: "reported" }),
        })
      );
    });
  });

  describe("findOrgAndGlobalEntries", () => {
    it("marks global entries as read only", async () => {
      prismaMock.watchlist.findMany.mockResolvedValue([
        makeEntry({ id: "org", isGlobal: false, organizationId: 3, audits: [{ changedByUserId: 1 }] }),
        makeEntry({ id: "global", isGlobal: true, organizationId: null, audits: [] }),
      ] as never);
      prismaMock.watchlist.count.mockResolvedValue(2 as never);

      const result = await repo.findOrgAndGlobalEntries({ organizationId: 3, limit: 10, offset: 0 });

      expect(result.rows[0]).toMatchObject({
        id: "org",
        isReadOnly: false,
        latestAudit: { changedByUserId: 1 },
      });
      expect(result.rows[1]).toMatchObject({ id: "global", isReadOnly: true, latestAudit: null });
      expect(result.meta).toEqual({ totalRowCount: 2 });
      expect(prismaMock.watchlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { organizationId: 3, isGlobal: false },
              { isGlobal: true, organizationId: null },
            ],
          },
        })
      );
    });

    it("adds search and filter conditions when provided", async () => {
      prismaMock.watchlist.findMany.mockResolvedValue([] as never);
      prismaMock.watchlist.count.mockResolvedValue(0 as never);

      await repo.findOrgAndGlobalEntries({
        organizationId: 3,
        limit: 1,
        offset: 2,
        searchTerm: "acme",
        filters: { type: WatchlistType.DOMAIN, source: WatchlistSource.MANUAL },
      });

      expect(prismaMock.watchlist.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          value: { contains: "acme", mode: "insensitive" },
          type: WatchlistType.DOMAIN,
          source: WatchlistSource.MANUAL,
        }),
      });
    });
  });
});
