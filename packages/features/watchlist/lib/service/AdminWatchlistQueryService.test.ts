import { WatchlistAction, WatchlistSource, WatchlistType } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WatchlistError, WatchlistErrorCode } from "../errors/WatchlistErrors";
import { AdminWatchlistQueryService } from "./AdminWatchlistQueryService";

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

function makeAudit(changedByUserId: number | null) {
  return {
    id: `audit-${changedByUserId ?? "none"}`,
    watchlistId: "entry-1",
    type: WatchlistType.EMAIL,
    value: "spam@example.com",
    description: null,
    action: WatchlistAction.BLOCK,
    changedByUserId,
    changedAt: new Date("2024-01-02T00:00:00.000Z"),
  };
}

function createDeps() {
  return {
    watchlistRepo: {
      findAllEntriesWithLatestAudit: vi.fn(),
      findEntryWithAuditAndReports: vi.fn(),
    },
    bookingReportRepo: {
      findGroupedReportedBookings: vi.fn(),
      countSystemPendingReports: vi.fn(),
    },
    userRepo: {
      findUsersByIds: vi.fn().mockResolvedValue([]),
    },
    prisma: {},
  };
}

describe("AdminWatchlistQueryService", () => {
  let deps: ReturnType<typeof createDeps>;
  let service: AdminWatchlistQueryService;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createDeps();
    service = new AdminWatchlistQueryService({
      watchlistRepo: deps.watchlistRepo as never,
      bookingReportRepo: deps.bookingReportRepo as never,
      userRepo: deps.userRepo as never,
      prisma: deps.prisma as never,
    });
  });

  describe("listWatchlistEntries", () => {
    it("only queries global entries and hydrates the audit author", async () => {
      deps.watchlistRepo.findAllEntriesWithLatestAudit.mockResolvedValue({
        rows: [
          { ...makeEntry({ id: "a" }), latestAudit: { changedByUserId: 5 } },
          { ...makeEntry({ id: "b" }), latestAudit: null },
        ],
        meta: { totalRowCount: 2 },
      });
      deps.userRepo.findUsersByIds.mockResolvedValue([{ id: 5, name: "Admin" }]);

      const result = await service.listWatchlistEntries({ limit: 10, offset: 0 });

      expect(deps.watchlistRepo.findAllEntriesWithLatestAudit).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: null, isGlobal: true, limit: 10, offset: 0 })
      );
      expect(deps.userRepo.findUsersByIds).toHaveBeenCalledWith([5]);
      expect(result.rows[0].latestAudit).toEqual({
        changedByUserId: 5,
        changedByUser: { id: 5, name: "Admin" },
      });
      expect(result.rows[1].latestAudit).toBeNull();
      expect(result.meta).toEqual({ totalRowCount: 2 });
    });

    it("deduplicates user ids and skips the user lookup when there are none", async () => {
      deps.watchlistRepo.findAllEntriesWithLatestAudit.mockResolvedValue({
        rows: [{ ...makeEntry(), latestAudit: { changedByUserId: null } }],
        meta: { totalRowCount: 1 },
      });

      await service.listWatchlistEntries({ limit: 5, offset: 0 });

      expect(deps.userRepo.findUsersByIds).not.toHaveBeenCalled();
    });
  });

  describe("getWatchlistEntryDetails", () => {
    it("throws NOT_FOUND when the entry does not exist", async () => {
      deps.watchlistRepo.findEntryWithAuditAndReports.mockResolvedValue({ entry: null, auditHistory: [] });

      await expect(service.getWatchlistEntryDetails({ entryId: "missing" })).rejects.toMatchObject({
        code: WatchlistErrorCode.NOT_FOUND,
      });
    });

    it("throws PERMISSION_DENIED for organization scoped entries", async () => {
      deps.watchlistRepo.findEntryWithAuditAndReports.mockResolvedValue({
        entry: makeEntry({ isGlobal: false, organizationId: 3 }),
        auditHistory: [],
      });

      const error = await service.getWatchlistEntryDetails({ entryId: "entry-1" }).catch((e) => e);

      expect(error).toBeInstanceOf(WatchlistError);
      expect(error.code).toBe(WatchlistErrorCode.PERMISSION_DENIED);
    });

    it("attaches the changing user to each audit row", async () => {
      deps.watchlistRepo.findEntryWithAuditAndReports.mockResolvedValue({
        entry: makeEntry(),
        auditHistory: [makeAudit(5), makeAudit(5), makeAudit(null)],
      });
      deps.userRepo.findUsersByIds.mockResolvedValue([{ id: 5, name: "Admin" }]);

      const result = await service.getWatchlistEntryDetails({ entryId: "entry-1" });

      expect(deps.userRepo.findUsersByIds).toHaveBeenCalledWith([5]);
      expect(result.auditHistory[0].changedByUser).toEqual({ id: 5, name: "Admin" });
      expect(result.auditHistory[2].changedByUser).toBeUndefined();
    });
  });

  it("listBookingReports forwards pagination and filters to the report repository", async () => {
    deps.bookingReportRepo.findGroupedReportedBookings.mockResolvedValue({ rows: [], total: 0 });

    const result = await service.listBookingReports({
      limit: 20,
      offset: 40,
      searchTerm: "spam",
      sortBy: "reportCount",
    });

    expect(result).toEqual({ rows: [], total: 0 });
    expect(deps.bookingReportRepo.findGroupedReportedBookings).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20, skip: 40, searchTerm: "spam", sortBy: "reportCount" })
    );
  });

  it("getPendingReportsCount returns the repository count", async () => {
    deps.bookingReportRepo.countSystemPendingReports.mockResolvedValue(3);

    await expect(service.getPendingReportsCount()).resolves.toBe(3);
  });
});
