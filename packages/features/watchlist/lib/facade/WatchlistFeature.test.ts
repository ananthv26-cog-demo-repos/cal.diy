import { WATCHLIST_DI_TOKENS } from "@calcom/features/di/watchlist/Watchlist.tokens";
import type { Container } from "@evyweb/ioctopus";
import { describe, expect, it, vi } from "vitest";
import { GlobalBlockingService } from "../service/GlobalBlockingService";
import { OrganizationBlockingService } from "../service/OrganizationBlockingService";
import { WatchlistAuditService } from "../service/WatchlistAuditService";
import { WatchlistService } from "../service/WatchlistService";
import { createWatchlistFeature } from "./WatchlistFeature";

describe("createWatchlistFeature", () => {
  it("resolves the repositories from the container and wires up every service", () => {
    const globalRepo = { findBlockedEmail: vi.fn() };
    const orgRepo = { findBlockedEmail: vi.fn() };
    const auditRepo = { create: vi.fn() };

    const registry = new Map<symbol, unknown>([
      [WATCHLIST_DI_TOKENS.GLOBAL_WATCHLIST_REPOSITORY, globalRepo],
      [WATCHLIST_DI_TOKENS.ORGANIZATION_WATCHLIST_REPOSITORY, orgRepo],
      [WATCHLIST_DI_TOKENS.AUDIT_REPOSITORY, auditRepo],
    ]);
    const get = vi.fn((token: symbol) => registry.get(token));
    const container = { get } as unknown as Container;

    const feature = createWatchlistFeature(container);

    expect(get).toHaveBeenCalledWith(WATCHLIST_DI_TOKENS.GLOBAL_WATCHLIST_REPOSITORY);
    expect(get).toHaveBeenCalledWith(WATCHLIST_DI_TOKENS.ORGANIZATION_WATCHLIST_REPOSITORY);
    expect(get).toHaveBeenCalledWith(WATCHLIST_DI_TOKENS.AUDIT_REPOSITORY);
    expect(feature.globalBlocking).toBeInstanceOf(GlobalBlockingService);
    expect(feature.orgBlocking).toBeInstanceOf(OrganizationBlockingService);
    expect(feature.watchlist).toBeInstanceOf(WatchlistService);
    expect(feature.audit).toBeInstanceOf(WatchlistAuditService);
  });
});
