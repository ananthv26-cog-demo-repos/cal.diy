import { WatchlistAction, WatchlistType } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IAuditRepository } from "../interface/IAuditRepository";
import { WatchlistAuditService } from "./WatchlistAuditService";

const auditRepository: IAuditRepository = {
  create: vi.fn(),
  findById: vi.fn(),
  findByWatchlistId: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  findMany: vi.fn(),
};

const audit = {
  id: "audit-1",
  type: WatchlistType.EMAIL,
  value: "spam@example.com",
  description: null,
  action: WatchlistAction.BLOCK,
  changedAt: new Date("2024-01-01T00:00:00.000Z"),
  changedByUserId: 1,
  watchlistId: "entry-1",
};

describe("WatchlistAuditService", () => {
  let service: WatchlistAuditService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WatchlistAuditService({ auditRepository });
  });

  it("createAuditEntry delegates to the repository", async () => {
    vi.mocked(auditRepository.create).mockResolvedValue(audit);
    const input = {
      type: WatchlistType.EMAIL,
      value: "spam@example.com",
      action: WatchlistAction.BLOCK,
      watchlistId: "entry-1",
    };

    await expect(service.createAuditEntry(input)).resolves.toEqual(audit);
    expect(auditRepository.create).toHaveBeenCalledWith(input);
  });

  it("getAuditEntry returns null when the entry is missing", async () => {
    vi.mocked(auditRepository.findById).mockResolvedValue(null);

    await expect(service.getAuditEntry("missing")).resolves.toBeNull();
    expect(auditRepository.findById).toHaveBeenCalledWith("missing");
  });

  it("getAuditHistory returns the repository rows", async () => {
    vi.mocked(auditRepository.findByWatchlistId).mockResolvedValue([audit]);

    await expect(service.getAuditHistory("entry-1")).resolves.toEqual([audit]);
    expect(auditRepository.findByWatchlistId).toHaveBeenCalledWith("entry-1");
  });

  it("updateAuditEntry forwards the id and payload", async () => {
    vi.mocked(auditRepository.update).mockResolvedValue(audit);

    await service.updateAuditEntry("audit-1", { value: "new@example.com" });

    expect(auditRepository.update).toHaveBeenCalledWith("audit-1", { value: "new@example.com" });
  });

  it("deleteAuditEntry delegates to the repository", async () => {
    vi.mocked(auditRepository.delete).mockResolvedValue(undefined);

    await expect(service.deleteAuditEntry("audit-1")).resolves.toBeUndefined();
    expect(auditRepository.delete).toHaveBeenCalledWith("audit-1");
  });

  it("getAuditEntries passes filters through", async () => {
    vi.mocked(auditRepository.findMany).mockResolvedValue([audit]);

    await service.getAuditEntries({ watchlistId: "entry-1", limit: 5 });

    expect(auditRepository.findMany).toHaveBeenCalledWith({ watchlistId: "entry-1", limit: 5 });
  });

  it("getAuditEntries works without filters", async () => {
    vi.mocked(auditRepository.findMany).mockResolvedValue([]);

    await expect(service.getAuditEntries()).resolves.toEqual([]);
    expect(auditRepository.findMany).toHaveBeenCalledWith(undefined);
  });
});
