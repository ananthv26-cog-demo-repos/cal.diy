import { WatchlistAction, WatchlistSource } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  IGlobalWatchlistRepository,
  IOrganizationWatchlistRepository,
} from "../interface/IWatchlistRepositories";
import { WatchlistType } from "../types";
import { GlobalBlockingService } from "./GlobalBlockingService";
import { OrganizationBlockingService } from "./OrganizationBlockingService";

const ORG_ID = 42;

function makeEntry(type: WatchlistType, value: string) {
  return {
    id: `entry-${value}`,
    type,
    value,
    description: null,
    action: WatchlistAction.BLOCK,
    source: WatchlistSource.MANUAL,
    isGlobal: true,
    organizationId: null,
    lastUpdatedAt: new Date("2024-01-01T00:00:00.000Z"),
  };
}

function createGlobalRepo() {
  return {
    findBlockedEmail: vi.fn(),
    findBlockedDomain: vi.fn(),
    findFreeEmailDomain: vi.fn(),
    findBlockingEntriesForEmailsAndDomains: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    listBlockedEntries: vi.fn(),
    createEntry: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
  };
}

function createOrgRepo() {
  return {
    findBlockedEmail: vi.fn(),
    findBlockedDomain: vi.fn(),
    findBlockingEntriesForEmailsAndDomains: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    listBlockedEntries: vi.fn(),
    listAllOrganizationEntries: vi.fn(),
    createEntry: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
  };
}

describe("GlobalBlockingService.areBlocked", () => {
  let globalRepo: ReturnType<typeof createGlobalRepo>;
  let service: GlobalBlockingService;

  beforeEach(() => {
    vi.clearAllMocks();
    globalRepo = createGlobalRepo();
    service = new GlobalBlockingService({ globalRepo: globalRepo as unknown as IGlobalWatchlistRepository });
  });

  it("returns an empty map and skips the query for an empty input", async () => {
    const result = await service.areBlocked([]);

    expect(result.size).toBe(0);
    expect(globalRepo.findBlockingEntriesForEmailsAndDomains).not.toHaveBeenCalled();
  });

  it("queries every normalized email plus its domain and wildcard patterns once", async () => {
    await service.areBlocked([" USER@Sub.Example.com ", "other@sub.example.com"]);

    const arg = globalRepo.findBlockingEntriesForEmailsAndDomains.mock.calls[0][0];
    expect(arg.emails).toEqual(["user@sub.example.com", "other@sub.example.com"]);
    expect(arg.domains).toContain("sub.example.com");
    expect(arg.domains).toContain("*.example.com");
    expect(new Set(arg.domains).size).toBe(arg.domains.length);
  });

  it("reports email matches with precedence over domain matches", async () => {
    globalRepo.findBlockingEntriesForEmailsAndDomains.mockResolvedValue([
      makeEntry(WatchlistType.EMAIL, "Spam@Example.com"),
      makeEntry(WatchlistType.DOMAIN, "example.com"),
    ]);

    const result = await service.areBlocked(["spam@example.com"]);

    expect(result.get("spam@example.com")).toMatchObject({
      isBlocked: true,
      reason: WatchlistType.EMAIL,
    });
  });

  it("matches wildcard domain entries and leaves unmatched emails unblocked", async () => {
    globalRepo.findBlockingEntriesForEmailsAndDomains.mockResolvedValue([
      makeEntry(WatchlistType.DOMAIN, "*.example.com"),
    ]);

    const result = await service.areBlocked(["user@sub.example.com", "user@other.com"]);

    expect(result.get("user@sub.example.com")).toMatchObject({
      isBlocked: true,
      reason: WatchlistType.DOMAIN,
    });
    expect(result.get("user@other.com")).toEqual({ isBlocked: false });
  });
});

describe("OrganizationBlockingService", () => {
  let orgRepo: ReturnType<typeof createOrgRepo>;
  let service: OrganizationBlockingService;

  beforeEach(() => {
    vi.clearAllMocks();
    orgRepo = createOrgRepo();
    service = new OrganizationBlockingService({
      orgRepo: orgRepo as unknown as IOrganizationWatchlistRepository,
    });
  });

  it("areBlocked returns an empty map without an organizationId", async () => {
    const result = await service.areBlocked(["user@example.com"], 0);

    expect(result.size).toBe(0);
    expect(orgRepo.findBlockingEntriesForEmailsAndDomains).not.toHaveBeenCalled();
  });

  it("areBlocked returns an empty map for an empty email list", async () => {
    const result = await service.areBlocked([], ORG_ID);

    expect(result.size).toBe(0);
  });

  it("areBlocked scopes the query to the organization", async () => {
    await service.areBlocked(["USER@example.com"], ORG_ID);

    expect(orgRepo.findBlockingEntriesForEmailsAndDomains).toHaveBeenCalledWith(
      expect.objectContaining({ emails: ["user@example.com"], organizationId: ORG_ID })
    );
  });

  it("areBlocked flags email and domain matches and leaves the rest unblocked", async () => {
    orgRepo.findBlockingEntriesForEmailsAndDomains.mockResolvedValue([
      makeEntry(WatchlistType.EMAIL, "spam@example.com"),
      makeEntry(WatchlistType.DOMAIN, "blocked.com"),
    ]);

    const result = await service.areBlocked(
      ["spam@example.com", "someone@blocked.com", "ok@allowed.com"],
      ORG_ID
    );

    expect(result.get("spam@example.com")?.reason).toBe(WatchlistType.EMAIL);
    expect(result.get("someone@blocked.com")?.reason).toBe(WatchlistType.DOMAIN);
    expect(result.get("ok@allowed.com")).toEqual({ isBlocked: false });
  });

  it("isDomainBlocked normalizes the domain and reports a match", async () => {
    const entry = makeEntry(WatchlistType.DOMAIN, "blocked.com");
    orgRepo.findBlockedDomain.mockResolvedValue(entry);

    const result = await service.isDomainBlocked(" Blocked.COM ", ORG_ID);

    expect(orgRepo.findBlockedDomain).toHaveBeenCalledWith("blocked.com", ORG_ID);
    expect(result).toEqual({ isBlocked: true, reason: WatchlistType.DOMAIN, watchlistEntry: entry });
  });

  it("isDomainBlocked reports not blocked when there is no entry", async () => {
    orgRepo.findBlockedDomain.mockResolvedValue(null);

    await expect(service.isDomainBlocked("allowed.com", ORG_ID)).resolves.toEqual({ isBlocked: false });
  });
});
