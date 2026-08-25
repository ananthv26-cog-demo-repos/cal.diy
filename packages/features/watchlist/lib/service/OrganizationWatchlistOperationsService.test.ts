import { BookingReportStatus, WatchlistType } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WatchlistErrorCode } from "../errors/WatchlistErrors";
import { OrganizationWatchlistOperationsService } from "./OrganizationWatchlistOperationsService";

const ORG_ID = 42;

function createDeps() {
  return {
    watchlistRepo: {
      createEntryIfNotExists: vi.fn().mockResolvedValue({ id: "entry-1" }),
      deleteEntry: vi.fn().mockResolvedValue(undefined),
      createEntryFromReport: vi.fn().mockResolvedValue({ watchlistEntry: { id: "entry-1" } }),
    },
    bookingReportRepo: {
      findPendingReportsByEmail: vi.fn().mockResolvedValue([]),
      findPendingReportsByDomain: vi.fn().mockResolvedValue([]),
      bulkLinkWatchlistWithStatus: vi.fn().mockResolvedValue(undefined),
      dismissReportsByEmail: vi.fn().mockResolvedValue({ count: 0 }),
    },
    permissionCheckService: { checkPermission: vi.fn().mockResolvedValue(true) },
  };
}

function createService(deps: ReturnType<typeof createDeps>) {
  return new OrganizationWatchlistOperationsService({
    watchlistRepo: deps.watchlistRepo as never,
    bookingReportRepo: deps.bookingReportRepo as never,
    permissionCheckService: deps.permissionCheckService as never,
    organizationId: ORG_ID,
  });
}

describe("OrganizationWatchlistOperationsService", () => {
  let deps: ReturnType<typeof createDeps>;
  let service: OrganizationWatchlistOperationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createDeps();
    service = createService(deps);
  });

  describe("validateEmailOrDomain", () => {
    it("rejects malformed emails", () => {
      expect(() => service.validateEmailOrDomain(WatchlistType.EMAIL, "not-an-email")).toThrowError(
        /Invalid email address format/
      );
    });

    it("accepts wildcard domains", () => {
      expect(() => service.validateEmailOrDomain(WatchlistType.DOMAIN, "*.example.com")).not.toThrow();
    });

    it("rejects malformed domains", () => {
      expect(() => service.validateEmailOrDomain(WatchlistType.DOMAIN, "not a domain")).toThrowError(
        /Invalid domain format/
      );
    });

    it("does not validate usernames", () => {
      expect(() => service.validateEmailOrDomain(WatchlistType.USERNAME, "anything at all")).not.toThrow();
    });
  });

  describe("createWatchlistEntry", () => {
    it("creates a lowercase org-scoped entry", async () => {
      const result = await service.createWatchlistEntry({
        type: WatchlistType.EMAIL,
        value: "Spam@Example.com",
        description: "bad actor",
        userId: 7,
      });

      expect(result).toEqual({ success: true, entry: { id: "entry-1" } });
      expect(deps.watchlistRepo.createEntryIfNotExists).toHaveBeenCalledWith(
        expect.objectContaining({ value: "spam@example.com", organizationId: ORG_ID, isGlobal: false })
      );
    });

    it("throws when the user lacks the create permission", async () => {
      deps.permissionCheckService.checkPermission.mockResolvedValue(false);

      await expect(
        service.createWatchlistEntry({ type: WatchlistType.EMAIL, value: "a@b.com", userId: 7 })
      ).rejects.toMatchObject({ code: WatchlistErrorCode.PERMISSION_DENIED });
      expect(deps.watchlistRepo.createEntryIfNotExists).not.toHaveBeenCalled();
    });
  });

  describe("deleteWatchlistEntry", () => {
    it("delegates to the repository", async () => {
      await expect(service.deleteWatchlistEntry({ entryId: "entry-1", userId: 7 })).resolves.toEqual({
        success: true,
        message: "Entry deleted successfully",
      });
      expect(deps.watchlistRepo.deleteEntry).toHaveBeenCalledWith("entry-1", 7);
    });

    it("throws when the user lacks the delete permission", async () => {
      deps.permissionCheckService.checkPermission.mockResolvedValue(false);

      await expect(service.deleteWatchlistEntry({ entryId: "entry-1", userId: 7 })).rejects.toMatchObject({
        code: WatchlistErrorCode.PERMISSION_DENIED,
      });
    });
  });

  describe("addToWatchlistByEmail", () => {
    it("links pending email reports to the created entry", async () => {
      deps.bookingReportRepo.findPendingReportsByEmail.mockResolvedValue([
        { id: "report-1", bookerEmail: "spam@example.com", watchlistId: null },
      ]);

      const result = await service.addToWatchlistByEmail({
        email: " Spam@Example.com ",
        type: WatchlistType.EMAIL,
        userId: 7,
      });

      expect(deps.bookingReportRepo.findPendingReportsByEmail).toHaveBeenCalledWith({
        email: "spam@example.com",
        organizationId: ORG_ID,
      });
      expect(deps.bookingReportRepo.bulkLinkWatchlistWithStatus).toHaveBeenCalledWith({
        links: [{ reportId: "report-1", watchlistId: "entry-1" }],
        status: BookingReportStatus.BLOCKED,
      });
      expect(result).toEqual({
        success: true,
        message: "Successfully added email to blocklist",
        addedCount: 1,
        skippedCount: 0,
        results: [{ reportId: "report-1", watchlistId: "entry-1" }],
      });
    });

    it("uses the extracted domain and skips linking when there are no reports", async () => {
      const result = await service.addToWatchlistByEmail({
        email: "spam@example.com",
        type: WatchlistType.DOMAIN,
        userId: 7,
      });

      expect(deps.bookingReportRepo.findPendingReportsByDomain).toHaveBeenCalledWith({
        domain: "example.com",
        organizationId: ORG_ID,
      });
      expect(deps.bookingReportRepo.bulkLinkWatchlistWithStatus).not.toHaveBeenCalled();
      expect(result.message).toBe("Successfully added domain to blocklist");
      expect(result.addedCount).toBe(0);
    });
  });

  describe("dismissReportByEmail", () => {
    it("dismisses the pending reports of the organization", async () => {
      deps.bookingReportRepo.dismissReportsByEmail.mockResolvedValue({ count: 2 });

      await expect(service.dismissReportByEmail({ email: "Spam@Example.com", userId: 7 })).resolves.toEqual({
        success: true,
        count: 2,
      });
      expect(deps.bookingReportRepo.dismissReportsByEmail).toHaveBeenCalledWith({
        email: "spam@example.com",
        status: BookingReportStatus.DISMISSED,
        organizationId: ORG_ID,
      });
    });

    it("throws NOT_FOUND when nothing was dismissed", async () => {
      await expect(
        service.dismissReportByEmail({ email: "spam@example.com", userId: 7 })
      ).rejects.toMatchObject({ code: WatchlistErrorCode.NOT_FOUND });
    });
  });
});
