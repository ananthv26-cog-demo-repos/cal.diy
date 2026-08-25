import { WatchlistType } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BlockingResult } from "../interface/IBlockingService";
import type { GlobalBlockingService } from "./GlobalBlockingService";
import type { OrganizationBlockingService } from "./OrganizationBlockingService";
import { SpamCheckService } from "./SpamCheckService";

function createServices() {
  const globalBlockingService = { isBlocked: vi.fn<() => Promise<BlockingResult>>() };
  const organizationBlockingService = { isBlocked: vi.fn<() => Promise<BlockingResult>>() };
  const service = new SpamCheckService(
    globalBlockingService as unknown as GlobalBlockingService,
    organizationBlockingService as unknown as OrganizationBlockingService
  );
  return { service, globalBlockingService, organizationBlockingService };
}

describe("SpamCheckService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when waitForCheck is called before startCheck", async () => {
    const { service } = createServices();

    await expect(service.waitForCheck()).rejects.toThrow(/called before startCheck/);
  });

  it("returns the global result when the email is globally blocked", async () => {
    const { service, globalBlockingService, organizationBlockingService } = createServices();
    const blocked = { isBlocked: true, reason: WatchlistType.EMAIL };
    globalBlockingService.isBlocked.mockResolvedValue(blocked);
    organizationBlockingService.isBlocked.mockResolvedValue({ isBlocked: false });

    service.startCheck({ email: "spam@example.com", organizationId: 1 });

    await expect(service.waitForCheck()).resolves.toEqual(blocked);
  });

  it("falls back to the organization result when only the org blocks the email", async () => {
    const { service, globalBlockingService, organizationBlockingService } = createServices();
    const orgBlocked = { isBlocked: true, reason: WatchlistType.DOMAIN };
    globalBlockingService.isBlocked.mockResolvedValue({ isBlocked: false });
    organizationBlockingService.isBlocked.mockResolvedValue(orgBlocked);

    service.startCheck({ email: "spam@example.com", organizationId: 7 });

    await expect(service.waitForCheck()).resolves.toEqual(orgBlocked);
    expect(organizationBlockingService.isBlocked).toHaveBeenCalledWith("spam@example.com", 7);
  });

  it("skips the organization check when no organizationId is given", async () => {
    const { service, globalBlockingService, organizationBlockingService } = createServices();
    globalBlockingService.isBlocked.mockResolvedValue({ isBlocked: false });

    service.startCheck({ email: "user@example.com", organizationId: null });

    await expect(service.waitForCheck()).resolves.toEqual({ isBlocked: false });
    expect(organizationBlockingService.isBlocked).not.toHaveBeenCalled();
  });

  it("swallows errors from the underlying checks and reports not blocked", async () => {
    const { service, globalBlockingService } = createServices();
    globalBlockingService.isBlocked.mockRejectedValue(new Error("db down"));

    service.startCheck({ email: "user@example.com", organizationId: null });

    await expect(service.waitForCheck()).resolves.toEqual({ isBlocked: false });
  });
});
