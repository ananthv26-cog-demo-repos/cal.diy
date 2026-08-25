import type { PrismaClient } from "@calcom/prisma/client";
import { WatchlistAction, WatchlistType } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it } from "vitest";
import { type DeepMockProxy, mockDeep } from "vitest-mock-extended";
import { PrismaWatchlistAuditRepository } from "./PrismaWatchlistAuditRepository";

function makeAudit(overrides: Record<string, unknown> = {}) {
  return {
    id: "audit-1",
    type: WatchlistType.EMAIL,
    value: "spam@example.com",
    description: null,
    action: WatchlistAction.BLOCK,
    changedAt: new Date("2024-01-01T00:00:00.000Z"),
    changedByUserId: 1,
    watchlistId: "entry-1",
    ...overrides,
  };
}

describe("PrismaWatchlistAuditRepository", () => {
  let prismaMock: DeepMockProxy<PrismaClient>;
  let repo: PrismaWatchlistAuditRepository;

  beforeEach(() => {
    prismaMock = mockDeep<PrismaClient>();
    repo = new PrismaWatchlistAuditRepository(prismaMock);
  });

  it("create persists the audit payload", async () => {
    const audit = makeAudit();
    prismaMock.watchlistAudit.create.mockResolvedValue(audit as never);

    const result = await repo.create({
      type: WatchlistType.EMAIL,
      value: "spam@example.com",
      description: "blocked",
      action: WatchlistAction.BLOCK,
      changedByUserId: 1,
      watchlistId: "entry-1",
    });

    expect(result).toEqual(audit);
    expect(prismaMock.watchlistAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          type: WatchlistType.EMAIL,
          value: "spam@example.com",
          description: "blocked",
          action: WatchlistAction.BLOCK,
          changedByUserId: 1,
          watchlistId: "entry-1",
        },
      })
    );
  });

  it("findById returns null when there is no match", async () => {
    prismaMock.watchlistAudit.findUnique.mockResolvedValue(null as never);

    await expect(repo.findById("missing")).resolves.toBeNull();
    expect(prismaMock.watchlistAudit.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "missing" } })
    );
  });

  it("findByWatchlistId returns audits newest first", async () => {
    prismaMock.watchlistAudit.findMany.mockResolvedValue([makeAudit()] as never);

    const result = await repo.findByWatchlistId("entry-1");

    expect(result).toHaveLength(1);
    expect(prismaMock.watchlistAudit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { watchlistId: "entry-1" },
        orderBy: { changedAt: "desc" },
      })
    );
  });

  describe("update", () => {
    it("omits fields that were not provided", async () => {
      prismaMock.watchlistAudit.update.mockResolvedValue(makeAudit() as never);

      await repo.update("audit-1", { value: "new@example.com" });

      expect(prismaMock.watchlistAudit.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "audit-1" }, data: { value: "new@example.com" } })
      );
    });

    it("allows nulling description and changedByUserId", async () => {
      prismaMock.watchlistAudit.update.mockResolvedValue(makeAudit() as never);

      await repo.update("audit-1", {
        type: WatchlistType.DOMAIN,
        action: WatchlistAction.ALERT,
        description: null,
        changedByUserId: null,
      });

      expect(prismaMock.watchlistAudit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            type: WatchlistType.DOMAIN,
            action: WatchlistAction.ALERT,
            description: null,
            changedByUserId: null,
          },
        })
      );
    });
  });

  it("delete resolves to undefined", async () => {
    prismaMock.watchlistAudit.delete.mockResolvedValue(makeAudit() as never);

    await expect(repo.delete("audit-1")).resolves.toBeUndefined();
    expect(prismaMock.watchlistAudit.delete).toHaveBeenCalledWith({ where: { id: "audit-1" } });
  });

  describe("findMany", () => {
    it("queries without filters", async () => {
      prismaMock.watchlistAudit.findMany.mockResolvedValue([] as never);

      await repo.findMany();

      expect(prismaMock.watchlistAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, orderBy: { changedAt: "desc" } })
      );
    });

    it("applies watchlist, user and pagination filters", async () => {
      prismaMock.watchlistAudit.findMany.mockResolvedValue([makeAudit()] as never);

      await repo.findMany({ watchlistId: "entry-1", changedByUserId: 2, limit: 10, offset: 5 });

      expect(prismaMock.watchlistAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { watchlistId: "entry-1", changedByUserId: 2 },
          take: 10,
          skip: 5,
        })
      );
    });
  });
});
