import { MembershipRole, WatchlistAction, WatchlistSource, WatchlistType } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WatchlistErrorCode } from "../errors/WatchlistErrors";
import { OrganizationWatchlistQueryService } from "./OrganizationWatchlistQueryService";

const ORG_ID = 42;

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    type: WatchlistType.EMAIL,
    value: "spam@example.com",
    action: WatchlistAction.BLOCK,
    description: null,
    organizationId: ORG_ID,
    isGlobal: false,
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
      findOrgAndGlobalEntries: vi.fn(),
      findEntryWithAuditAndReports: vi.fn(),
    },
    userRepo: { findUsersByIds: vi.fn().mockResolvedValue([]) },
    permissionCheckService: { checkPermission: vi.fn().mockResolvedValue(true) },
  };
}

describe("OrganizationWatchlistQueryService", () => {
  let deps: ReturnType<typeof createDeps>;
  let service: OrganizationWatchlistQueryService;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createDeps();
    service = new OrganizationWatchlistQueryService({
      watchlistRepo: deps.watchlistRepo as never,
      userRepo: deps.userRepo as never,
      permissionCheckService: deps.permissionCheckService as never,
    });
  });

  describe("listWatchlistEntries", () => {
    it("checks the read permission with the org fallback roles", async () => {
      deps.watchlistRepo.findOrgAndGlobalEntries.mockResolvedValue({
        rows: [],
        meta: { totalRowCount: 0 },
      });

      await service.listWatchlistEntries({ organizationId: ORG_ID, userId: 1, limit: 10, offset: 0 });

      expect(deps.permissionCheckService.checkPermission).toHaveBeenCalledWith({
        userId: 1,
        teamId: ORG_ID,
        permission: "watchlist.read",
        fallbackRoles: [MembershipRole.OWNER, MembershipRole.ADMIN],
      });
    });

    it("throws PERMISSION_DENIED when the user may not read the watchlist", async () => {
      deps.permissionCheckService.checkPermission.mockResolvedValue(false);

      await expect(
        service.listWatchlistEntries({ organizationId: ORG_ID, userId: 1, limit: 10, offset: 0 })
      ).rejects.toMatchObject({ code: WatchlistErrorCode.PERMISSION_DENIED });
      expect(deps.watchlistRepo.findOrgAndGlobalEntries).not.toHaveBeenCalled();
    });

    it("hydrates the audit author for rows that have one", async () => {
      deps.watchlistRepo.findOrgAndGlobalEntries.mockResolvedValue({
        rows: [
          { ...makeEntry({ id: "a" }), latestAudit: { changedByUserId: 8 } },
          { ...makeEntry({ id: "b" }), latestAudit: null },
        ],
        meta: { totalRowCount: 2 },
      });
      deps.userRepo.findUsersByIds.mockResolvedValue([{ id: 8, name: "Owner" }]);

      const result = await service.listWatchlistEntries({
        organizationId: ORG_ID,
        userId: 1,
        limit: 10,
        offset: 0,
        searchTerm: "spam",
      });

      expect(deps.watchlistRepo.findOrgAndGlobalEntries).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG_ID, searchTerm: "spam" })
      );
      expect(result.rows[0].latestAudit).toEqual({
        changedByUserId: 8,
        changedByUser: { id: 8, name: "Owner" },
      });
      expect(result.rows[1].latestAudit).toBeNull();
    });
  });

  describe("getWatchlistEntryDetails", () => {
    it("throws NOT_FOUND when the entry does not exist", async () => {
      deps.watchlistRepo.findEntryWithAuditAndReports.mockResolvedValue({ entry: null, auditHistory: [] });

      await expect(
        service.getWatchlistEntryDetails({ organizationId: ORG_ID, userId: 1, entryId: "missing" })
      ).rejects.toMatchObject({ code: WatchlistErrorCode.NOT_FOUND });
    });

    it("throws PERMISSION_DENIED for entries owned by another organization", async () => {
      deps.watchlistRepo.findEntryWithAuditAndReports.mockResolvedValue({
        entry: makeEntry({ organizationId: 99 }),
        auditHistory: [],
      });

      await expect(
        service.getWatchlistEntryDetails({ organizationId: ORG_ID, userId: 1, entryId: "entry-1" })
      ).rejects.toMatchObject({ code: WatchlistErrorCode.PERMISSION_DENIED });
    });

    it("returns org entries as editable with hydrated audit authors", async () => {
      deps.watchlistRepo.findEntryWithAuditAndReports.mockResolvedValue({
        entry: makeEntry(),
        auditHistory: [makeAudit(8), makeAudit(null)],
      });
      deps.userRepo.findUsersByIds.mockResolvedValue([{ id: 8, name: "Owner" }]);

      const result = await service.getWatchlistEntryDetails({
        organizationId: ORG_ID,
        userId: 1,
        entryId: "entry-1",
      });

      expect(result.isReadOnly).toBe(false);
      expect(result.auditHistory[0].changedByUser).toEqual({ id: 8, name: "Owner" });
      expect(result.auditHistory[1].changedByUser).toBeUndefined();
    });

    it("returns global entries as read only", async () => {
      deps.watchlistRepo.findEntryWithAuditAndReports.mockResolvedValue({
        entry: makeEntry({ isGlobal: true, organizationId: null }),
        auditHistory: [],
      });

      const result = await service.getWatchlistEntryDetails({
        organizationId: ORG_ID,
        userId: 1,
        entryId: "entry-1",
      });

      expect(result.isReadOnly).toBe(true);
      expect(deps.userRepo.findUsersByIds).not.toHaveBeenCalled();
    });
  });
});
