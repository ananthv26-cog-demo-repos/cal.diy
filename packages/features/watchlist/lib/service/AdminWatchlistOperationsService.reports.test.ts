import { SystemReportStatus, WatchlistType } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WatchlistErrorCode } from "../errors/WatchlistErrors";
import { AdminWatchlistOperationsService } from "./AdminWatchlistOperationsService";

vi.mock("@calcom/features/auth/lib/verifyEmail", () => ({
  sendEmailVerification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@calcom/prisma", () => ({
  default: {},
  prisma: {},
}));

function createDeps() {
  return {
    watchlistRepo: {
      createEntryIfNotExists: vi.fn().mockResolvedValue({ id: "entry-1" }),
      createEntryFromReport: vi.fn().mockResolvedValue({ watchlistEntry: { id: "entry-1" } }),
    },
    bookingReportRepo: {
      findPendingSystemReportsByEmail: vi.fn().mockResolvedValue([]),
      findPendingSystemReportsByDomain: vi.fn().mockResolvedValue([]),
      bulkLinkGlobalWatchlistWithSystemStatus: vi.fn().mockResolvedValue(undefined),
      dismissSystemReportsByEmail: vi.fn().mockResolvedValue({ count: 0 }),
    },
    userRepo: { unlockByEmail: vi.fn().mockResolvedValue(null) },
  };
}

describe("AdminWatchlistOperationsService report operations", () => {
  let deps: ReturnType<typeof createDeps>;
  let service: AdminWatchlistOperationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createDeps();
    service = new AdminWatchlistOperationsService({
      watchlistRepo: deps.watchlistRepo as never,
      bookingReportRepo: deps.bookingReportRepo as never,
      userRepo: deps.userRepo as never,
    });
  });

  it("creates global entries with the admin scope", async () => {
    const result = await service.createWatchlistEntry({
      type: WatchlistType.EMAIL,
      value: "Spam@Example.com",
      userId: 7,
    });

    expect(result.success).toBe(true);
    expect(deps.watchlistRepo.createEntryIfNotExists).toHaveBeenCalledWith(
      expect.objectContaining({ value: "spam@example.com", organizationId: null, isGlobal: true })
    );
  });

  describe("addToWatchlistByEmail", () => {
    it("links pending system reports for an email entry", async () => {
      deps.bookingReportRepo.findPendingSystemReportsByEmail.mockResolvedValue([
        { id: "report-1", bookerEmail: "spam@example.com", globalWatchlistId: null },
      ]);

      const result = await service.addToWatchlistByEmail({
        email: " Spam@Example.com ",
        type: WatchlistType.EMAIL,
        userId: 7,
      });

      expect(deps.bookingReportRepo.findPendingSystemReportsByEmail).toHaveBeenCalledWith({
        email: "spam@example.com",
      });
      expect(deps.bookingReportRepo.bulkLinkGlobalWatchlistWithSystemStatus).toHaveBeenCalledWith({
        links: [{ reportId: "report-1", globalWatchlistId: "entry-1" }],
        systemStatus: SystemReportStatus.BLOCKED,
      });
      expect(result).toMatchObject({
        success: true,
        message: "Successfully added email to global blocklist",
        addedCount: 1,
        skippedCount: 0,
      });
    });

    it("uses the extracted domain and skips linking when there are no reports", async () => {
      const result = await service.addToWatchlistByEmail({
        email: "spam@example.com",
        type: WatchlistType.DOMAIN,
        userId: 7,
      });

      expect(deps.bookingReportRepo.findPendingSystemReportsByDomain).toHaveBeenCalledWith({
        domain: "example.com",
      });
      expect(deps.bookingReportRepo.bulkLinkGlobalWatchlistWithSystemStatus).not.toHaveBeenCalled();
      expect(result.message).toBe("Successfully added domain to global blocklist");
    });
  });

  describe("dismissReportByEmail", () => {
    it("dismisses pending system reports", async () => {
      deps.bookingReportRepo.dismissSystemReportsByEmail.mockResolvedValue({ count: 3 });

      await expect(service.dismissReportByEmail({ email: "Spam@Example.com" })).resolves.toEqual({
        success: true,
        count: 3,
      });
      expect(deps.bookingReportRepo.dismissSystemReportsByEmail).toHaveBeenCalledWith({
        email: "spam@example.com",
        systemStatus: SystemReportStatus.DISMISSED,
      });
    });

    it("throws NOT_FOUND when there is nothing to dismiss", async () => {
      await expect(service.dismissReportByEmail({ email: "spam@example.com" })).rejects.toMatchObject({
        code: WatchlistErrorCode.NOT_FOUND,
      });
    });
  });

  describe("bulkDismissReportsByEmail", () => {
    it("sums the dismissed reports across emails", async () => {
      deps.bookingReportRepo.dismissSystemReportsByEmail
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ count: 1 });

      const result = await service.bulkDismissReportsByEmail({
        emails: ["A@example.com", "b@example.com"],
      });

      expect(result).toEqual({
        success: 3,
        failed: 0,
        message: "Dismissed 3 report(s) successfully",
      });
      expect(deps.bookingReportRepo.dismissSystemReportsByEmail).toHaveBeenNthCalledWith(1, {
        email: "a@example.com",
        systemStatus: SystemReportStatus.DISMISSED,
      });
    });

    it("reports when nothing was pending", async () => {
      const result = await service.bulkDismissReportsByEmail({ emails: ["a@example.com"] });

      expect(result).toEqual({ success: 0, failed: 0, message: "No pending reports found" });
    });
  });
});
