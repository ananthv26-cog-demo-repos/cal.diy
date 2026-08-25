import { EventTypeRepository } from "@calcom/features/eventtypes/repositories/eventTypeRepository";
import { MembershipRepository } from "@calcom/features/membership/repositories/MembershipRepository";
import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import type { PrismaClient } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createPrismaMock() {
  return {
    eventType: {
      create: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    membership: { findFirst: vi.fn() },
    team: { findMany: vi.fn() },
  };
}

type PrismaMock = ReturnType<typeof createPrismaMock>;

let prismaMock: PrismaMock;
let repository: EventTypeRepository;

/** Loose view of a prisma query argument tree, so assertions can drill into it. */
type QueryArgs = { [key: string]: QueryArgs };

/** Args of the last call to a mocked prisma delegate method. */
function lastArgs(fn: { mock: { calls: unknown[][] } }) {
  return fn.mock.calls[fn.mock.calls.length - 1][0] as QueryArgs;
}

function selectedCalendar(eventTypeId: number | null) {
  return { id: `cal-${eventTypeId ?? "user"}`, eventTypeId };
}

beforeEach(() => {
  vi.restoreAllMocks();
  prismaMock = createPrismaMock();
  repository = new EventTypeRepository(prismaMock as unknown as PrismaClient);
});

describe("findParentEventTypeId", () => {
  it("returns the parent id of a managed child event type", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue({ parentId: 42 });

    await expect(repository.findParentEventTypeId(1)).resolves.toBe(42);
    expect(lastArgs(prismaMock.eventType.findFirst).where).toEqual({ id: 1, parentId: { not: null } });
  });

  it("returns null when the event type has no parent", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(null);
    await expect(repository.findParentEventTypeId(1)).resolves.toBeNull();
  });
});

describe("create / createMany", () => {
  const base = { title: "30 min", slug: "30min", length: 30 };

  it("maps relation ids to prisma connect clauses", async () => {
    prismaMock.eventType.create.mockResolvedValue({ id: 1 });

    await repository.create({
      ...base,
      userId: 1,
      profileId: 2,
      teamId: 3,
      parentId: 4,
      scheduleId: 5,
      metadata: { key: "value" },
      bookingLimits: { PER_DAY: 1 },
      recurringEvent: { count: 2 },
      bookingFields: [{ name: "name" }],
      durationLimits: { PER_DAY: 60 },
    });

    expect(lastArgs(prismaMock.eventType.create)).toEqual({
      data: {
        ...base,
        owner: { connect: { id: 1 } },
        profile: { connect: { id: 2 } },
        team: { connect: { id: 3 } },
        parent: { connect: { id: 4 } },
        schedule: { connect: { id: 5 } },
        metadata: { key: "value" },
        bookingLimits: { PER_DAY: 1 },
        recurringEvent: { count: 2 },
        bookingFields: [{ name: "name" }],
        durationLimits: { PER_DAY: 60 },
      },
      include: { calVideoSettings: true },
    });
  });

  it("omits relations and json columns that were not provided", async () => {
    prismaMock.eventType.create.mockResolvedValue({ id: 1 });

    await repository.create(base);

    expect(lastArgs(prismaMock.eventType.create).data).toEqual(base);
  });

  it("createMany maps every entry", async () => {
    prismaMock.eventType.createMany.mockResolvedValue({ count: 2 });

    await repository.createMany([
      { ...base, userId: 1 },
      { ...base, teamId: 2 },
    ]);

    expect(lastArgs(prismaMock.eventType.createMany).data).toEqual([
      { ...base, owner: { connect: { id: 1 } } },
      { ...base, team: { connect: { id: 2 } } },
    ]);
  });
});

describe.each([
  ["findAllByUpId", (args: Parameters<EventTypeRepository["findAllByUpId"]>) => args],
  ["findAllByUpIdWithMinimalData", (args: Parameters<EventTypeRepository["findAllByUpId"]>) => args],
] as const)("%s", (methodName) => {
  const call = (
    ...args: Parameters<EventTypeRepository["findAllByUpId"]>
  ): ReturnType<EventTypeRepository["findAllByUpId"]> => repository[methodName](...args);

  beforeEach(() => {
    prismaMock.eventType.findMany.mockResolvedValue([]);
  });

  it("short circuits on an empty upId", async () => {
    await expect(call({ upId: "", userId: 1 })).resolves.toEqual([]);
    expect(prismaMock.eventType.findMany).not.toHaveBeenCalled();
  });

  it("queries by userId when the lookup target is a user", async () => {
    await call({ upId: "usr-9", userId: 9 });

    expect(lastArgs(prismaMock.eventType.findMany).where).toEqual({ userId: 9 });
  });

  it("resolves a uuid profile upId through the profile repository", async () => {
    vi.spyOn(ProfileRepository, "findByUid").mockResolvedValue({ id: 5 } as never);
    vi.spyOn(ProfileRepository, "findById").mockResolvedValue({ id: 5 } as never);

    await call({ upId: "prof-abc", userId: 9 });

    expect(ProfileRepository.findByUid).toHaveBeenCalledWith("abc");
    expect(lastArgs(prismaMock.eventType.findMany).where.OR).toEqual([
      { profileId: 5 },
      { userId: 9, parentId: { not: null } },
    ]);
  });

  it("falls back to a userId lookup when the profile uid cannot be resolved", async () => {
    vi.spyOn(ProfileRepository, "findByUid").mockResolvedValue(null as never);

    await call({ upId: "prof-missing", userId: 9 });

    expect(lastArgs(prismaMock.eventType.findMany).where).toEqual({ userId: undefined });
  });

  it("includes legacy user-owned events for a profile the user was moved to", async () => {
    vi.spyOn(ProfileRepository, "findById").mockResolvedValue({
      id: 5,
      movedFromUser: { id: 77 },
    } as never);

    await call({ upId: "5", userId: 9 });

    expect(lastArgs(prismaMock.eventType.findMany).where.OR).toEqual([
      { userId: 77, profileId: null },
      { profileId: 5 },
      { userId: 9, parentId: { not: null } },
    ]);
  });

  it("merges the caller's where clause and applies cursor pagination", async () => {
    await call({ upId: "usr-9", userId: 9 }, { where: { hidden: false }, cursor: 3, limit: 10 });

    const args = lastArgs(prismaMock.eventType.findMany);
    expect(args.where).toEqual({ userId: 9, hidden: false });
    expect(args.cursor).toEqual({ id: 3 });
    expect(args.take).toBe(11);
  });

  it("leaves cursor and take undefined when not paginating", async () => {
    await call({ upId: "usr-9", userId: 9 });

    const args = lastArgs(prismaMock.eventType.findMany);
    expect(args.cursor).toBeUndefined();
    expect(args.take).toBeUndefined();
  });
});

describe("findAllByUpId select shape", () => {
  it("includes users, children, hosts and team while the minimal variant does not", async () => {
    prismaMock.eventType.findMany.mockResolvedValue([]);

    await repository.findAllByUpId({ upId: "usr-1", userId: 1 });
    expect(lastArgs(prismaMock.eventType.findMany).select).toMatchObject({
      hashedLink: expect.anything(),
      users: expect.anything(),
      children: expect.anything(),
      hosts: expect.anything(),
      team: expect.anything(),
    });

    await repository.findAllByUpIdWithMinimalData({ upId: "usr-1", userId: 1 });
    const minimalSelect = lastArgs(prismaMock.eventType.findMany).select;
    expect(minimalSelect).toHaveProperty("hashedLink");
    expect(minimalSelect).not.toHaveProperty("hosts");
  });
});

describe("findTeamEventTypes", () => {
  it("throws when the user is neither a team member nor an org admin", async () => {
    prismaMock.membership.findFirst.mockResolvedValue(null);

    await expect(repository.findTeamEventTypes({ teamId: 1, userId: 2 })).rejects.toThrow(
      "User is not a member of this team"
    );
    expect(prismaMock.eventType.findMany).not.toHaveBeenCalled();
  });

  it("accepts an accepted member of the team and returns its event types", async () => {
    prismaMock.membership.findFirst.mockResolvedValue({ id: 1 });
    prismaMock.eventType.findMany.mockResolvedValue([{ id: 10 }]);

    await expect(repository.findTeamEventTypes({ teamId: 1, userId: 2 })).resolves.toEqual([{ id: 10 }]);
    expect(lastArgs(prismaMock.membership.findFirst).where.OR[0]).toEqual({
      teamId: 1,
      userId: 2,
      accepted: true,
    });
    expect(lastArgs(prismaMock.eventType.findMany).where).toEqual({ teamId: 1 });
  });

  it("restricts the parent org membership check when a parentId is given", async () => {
    prismaMock.membership.findFirst.mockResolvedValue({ id: 1 });
    prismaMock.eventType.findMany.mockResolvedValue([]);

    await repository.findTeamEventTypes({ teamId: 1, parentId: 99, userId: 2 });

    expect(lastArgs(prismaMock.membership.findFirst).where.OR[1].team.parent).toMatchObject({ id: 99 });
  });

  it("supports cursor pagination and extra filters", async () => {
    prismaMock.membership.findFirst.mockResolvedValue({ id: 1 });
    prismaMock.eventType.findMany.mockResolvedValue([]);

    await repository.findTeamEventTypes({
      teamId: 1,
      userId: 2,
      cursor: 5,
      limit: 3,
      where: { hidden: false },
    });

    const args = lastArgs(prismaMock.eventType.findMany);
    expect(args.cursor).toEqual({ id: 5 });
    expect(args.take).toBe(4);
    expect(args.where).toEqual({ teamId: 1, hidden: false });
  });
});

describe("simple lookups", () => {
  it("findAllByUserId filters by owner", async () => {
    prismaMock.eventType.findMany.mockResolvedValue([{ id: 1 }]);
    await expect(repository.findAllByUserId({ userId: 3 })).resolves.toEqual([{ id: 1 }]);
    expect(lastArgs(prismaMock.eventType.findMany)).toEqual({ where: { userId: 3 } });
  });

  it("findTitleById selects only the title", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue({ title: "30 min" });
    await expect(repository.findTitleById({ id: 1 })).resolves.toEqual({ title: "30 min" });
    expect(lastArgs(prismaMock.eventType.findUnique)).toEqual({ where: { id: 1 }, select: { title: true } });
  });

  it("findByIdWithUserAccess allows owners, hosts and assigned users", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue({ id: 1 });
    await repository.findByIdWithUserAccess({ id: 1, userId: 2 });
    expect(lastArgs(prismaMock.eventType.findUnique).where.OR).toEqual([
      { userId: 2 },
      { hosts: { some: { userId: 2 } } },
      { users: { some: { id: 2 } } },
    ]);
  });

  it("findByIdMinimal fetches the whole row", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue({ id: 1 });
    await expect(repository.findByIdMinimal({ id: 1 })).resolves.toEqual({ id: 1 });
    expect(lastArgs(prismaMock.eventType.findUnique)).toEqual({ where: { id: 1 } });
  });

  it("getFirstEventTypeByUserId only considers personal event types", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue({ id: 1 });
    await repository.getFirstEventTypeByUserId({ userId: 4 });
    expect(lastArgs(prismaMock.eventType.findFirst).where).toEqual({ userId: 4, teamId: null });
  });

  it("getTeamIdByEventTypeId selects the team id", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue({ teamId: 8 });
    await expect(repository.getTeamIdByEventTypeId({ id: 1 })).resolves.toEqual({ teamId: 8 });
  });

  it("findByIdWithTeamId selects id and team id", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue({ id: 1, teamId: 8 });
    await repository.findByIdWithTeamId({ id: 1 });
    expect(lastArgs(prismaMock.eventType.findUnique).select).toEqual({ id: true, teamId: true });
  });

  it("findByIdWithParent selects the parent id", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue({ id: 1, parentId: 2, userId: 3 });
    await expect(repository.findByIdWithParent(1)).resolves.toMatchObject({ parentId: 2 });
  });

  it("findByIdWithParentAndUserId also selects the scheduling type", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue({ id: 1 });
    await repository.findByIdWithParentAndUserId(1);
    expect(lastArgs(prismaMock.eventType.findUnique).select).toEqual({
      id: true,
      parentId: true,
      userId: true,
      schedulingType: true,
    });
  });

  it("findByIdTargetChildEventType uses the composite unique key", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue({ id: 1 });
    await repository.findByIdTargetChildEventType(3, 4);
    expect(lastArgs(prismaMock.eventType.findUnique).where).toEqual({
      userId_parentId: { userId: 3, parentId: 4 },
    });
  });

  it("findByIdIncludeBrandingInfo selects team and owner branding", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue({ id: 1 });
    await repository.findByIdIncludeBrandingInfo({ id: 1 });
    const select = lastArgs(prismaMock.eventType.findUnique).select;
    expect(select.team.select.hideBranding).toBe(true);
    expect(select.owner.select.profiles.select.organization.select.hideBranding).toBe(true);
  });

  it("findChildrenByParentIdIncludeOwner returns the children with their owners", async () => {
    prismaMock.eventType.findMany.mockResolvedValue([{ hidden: false, slug: "a", owner: { id: 1 } }]);
    await expect(repository.findChildrenByParentIdIncludeOwner(2)).resolves.toHaveLength(1);
    expect(lastArgs(prismaMock.eventType.findMany).where).toEqual({ parentId: 2 });
  });

  it("findAllByTeamIdIncludeManagedEventTypes matches team and managed children", async () => {
    prismaMock.eventType.findMany.mockResolvedValue([]);
    await repository.findAllByTeamIdIncludeManagedEventTypes({ teamId: 7 });
    expect(lastArgs(prismaMock.eventType.findMany).where.OR).toEqual([
      { teamId: 7 },
      { parent: { teamId: 7 } },
    ]);
  });
});

describe("findById", () => {
  it("scopes the query to the user's own, assigned and team event types", async () => {
    vi.spyOn(MembershipRepository, "findUserTeamIds").mockResolvedValue([3, 4]);
    prismaMock.eventType.findFirst.mockResolvedValue({ id: 1 });

    await expect(repository.findById({ id: 1, userId: 2 })).resolves.toEqual({ id: 1 });

    const where = lastArgs(prismaMock.eventType.findFirst).where;
    expect(where.AND[1]).toEqual({ id: 1 });
    expect(where.AND[0].OR).toEqual([
      { users: { some: { id: 2 } } },
      { AND: [{ teamId: { not: null } }, { teamId: { in: [3, 4] } }] },
      { userId: 2 },
    ]);
  });

  it("returns null when the user has no access", async () => {
    vi.spyOn(MembershipRepository, "findUserTeamIds").mockResolvedValue([]);
    prismaMock.eventType.findFirst.mockResolvedValue(null);

    await expect(repository.findById({ id: 1, userId: 2 })).resolves.toBeNull();
  });
});

describe("findByIdForOrgAdmin", () => {
  it("matches org member owned events and org team events", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue({ id: 1 });

    await expect(repository.findByIdForOrgAdmin({ id: 1, organizationId: 9 })).resolves.toEqual({ id: 1 });

    const where = lastArgs(prismaMock.eventType.findFirst).where;
    expect(where.AND[0]).toEqual({ id: 1 });
    expect(where.AND[1].OR).toEqual([
      { AND: [{ userId: { not: null } }, { owner: { profiles: { some: { organizationId: 9 } } } }] },
      { AND: [{ teamId: { not: null } }, { team: { parentId: 9 } }] },
    ]);
  });
});

describe("findFirstEventTypeId", () => {
  it("uses the team compound unique key when a teamId is given", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue({ id: 1 });
    await repository.findFirstEventTypeId({ slug: "30min", teamId: 5 });
    expect(lastArgs(prismaMock.eventType.findUnique).where).toEqual({
      teamId_slug: { teamId: 5, slug: "30min" },
    });
  });

  it("uses the user compound unique key when a userId is given", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue({ id: 1 });
    await repository.findFirstEventTypeId({ slug: "30min", userId: 6 });
    expect(lastArgs(prismaMock.eventType.findUnique).where).toEqual({
      userId_slug: { userId: 6, slug: "30min" },
    });
  });

  it("falls back to a slug only lookup", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue({ id: 1 });
    await repository.findFirstEventTypeId({ slug: "30min" });
    expect(lastArgs(prismaMock.eventType.findFirst).where).toEqual({ slug: "30min" });
    expect(prismaMock.eventType.findUnique).not.toHaveBeenCalled();
  });
});

describe("host and user calendar normalisation", () => {
  it("findByIdIncludeHostsAndTeam splits host calendars into user level and all", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue({
      id: 1,
      hosts: [{ user: { id: 2, selectedCalendars: [selectedCalendar(null), selectedCalendar(1)] } }],
    });

    const result = await repository.findByIdIncludeHostsAndTeam({ id: 1 });

    expect(result?.hosts[0].user).toEqual({
      id: 2,
      allSelectedCalendars: [selectedCalendar(null), selectedCalendar(1)],
      userLevelSelectedCalendars: [selectedCalendar(null)],
    });
  });

  it("findByIdIncludeHostsAndTeam returns null for a missing event type", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue(null);
    await expect(repository.findByIdIncludeHostsAndTeam({ id: 1 })).resolves.toBeNull();
  });

  it("findForSlots normalises hosts and users and parses json columns", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue({
      id: 1,
      hosts: [{ user: { id: 2, selectedCalendars: [selectedCalendar(1)] } }],
      users: [{ id: 3, selectedCalendars: [selectedCalendar(null)] }],
      metadata: { multipleDuration: [15, 30] },
      rrSegmentQueryValue: null,
    });

    const result = await repository.findForSlots({ id: 1 });

    expect(result?.hosts[0].user.userLevelSelectedCalendars).toEqual([]);
    expect(result?.users[0].userLevelSelectedCalendars).toEqual([selectedCalendar(null)]);
    expect(result?.metadata).toMatchObject({ multipleDuration: [15, 30] });
  });

  it("findForSlots returns null for a missing event type", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue(null);
    await expect(repository.findForSlots({ id: 1 })).resolves.toBeNull();
  });

  it("findForSlots rejects invalid metadata", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue({
      id: 1,
      hosts: [],
      users: [],
      metadata: { multipleDuration: "nope" },
      rrSegmentQueryValue: null,
    });

    await expect(repository.findForSlots({ id: 1 })).rejects.toThrow();
  });

  it("findByIdForUserAvailability parses metadata and returns null when missing", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue({ id: 1, metadata: null });
    await expect(repository.findByIdForUserAvailability({ id: 1 })).resolves.toMatchObject({
      metadata: null,
    });

    prismaMock.eventType.findUnique.mockResolvedValue(null);
    await expect(repository.findByIdForUserAvailability({ id: 1 })).resolves.toBeNull();
  });

  it("findByIdIncludeHostsAndTeamMembers only selects accepted admins and owners", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue({ id: 1 });
    await repository.findByIdIncludeHostsAndTeamMembers({ id: 1 });

    expect(lastArgs(prismaMock.eventType.findUnique).select.team.select.members.where).toEqual({
      accepted: true,
      role: { in: ["ADMIN", "OWNER"] },
    });
  });
});

describe("children lookups", () => {
  it("findEventTypesWithoutChildren restricts to parents when a teamId is given", async () => {
    prismaMock.eventType.findMany.mockResolvedValue([]);

    await repository.findEventTypesWithoutChildren([1, 2], 5);
    expect(lastArgs(prismaMock.eventType.findMany).where).toEqual({ id: { in: [1, 2] }, parentId: null });

    await repository.findEventTypesWithoutChildren([1, 2], null);
    expect(lastArgs(prismaMock.eventType.findMany).where).toEqual({ id: { in: [1, 2] } });
  });

  it("findAllIncludingChildrenByUserId returns nothing for a null userId", async () => {
    await expect(repository.findAllIncludingChildrenByUserId({ userId: null })).resolves.toEqual([]);
    expect(prismaMock.eventType.findMany).not.toHaveBeenCalled();
  });

  it("findAllIncludingChildrenByUserId queries by userId", async () => {
    prismaMock.eventType.findMany.mockResolvedValue([{ id: 1, children: [] }]);
    await repository.findAllIncludingChildrenByUserId({ userId: 3 });
    expect(lastArgs(prismaMock.eventType.findMany).where).toEqual({ userId: 3 });
  });

  it("findAllIncludingChildrenByTeamId queries by teamId", async () => {
    prismaMock.eventType.findMany.mockResolvedValue([]);
    await repository.findAllIncludingChildrenByTeamId({ teamId: 3 });
    expect(lastArgs(prismaMock.eventType.findMany).where).toEqual({ teamId: 3 });
  });

  it("findManyChildEventTypes optionally excludes a user", async () => {
    prismaMock.eventType.findMany.mockResolvedValue([]);

    await repository.findManyChildEventTypes(1);
    expect(lastArgs(prismaMock.eventType.findMany).where).toEqual({ parentId: 1 });

    await repository.findManyChildEventTypes(1, 9);
    expect(lastArgs(prismaMock.eventType.findMany).where).toEqual({ parentId: 1, userId: { not: 9 } });
  });
});

describe("findManyWithPagination", () => {
  it("returns the page together with the total count", async () => {
    prismaMock.eventType.findMany.mockResolvedValue([{ id: 1 }]);
    prismaMock.eventType.count.mockResolvedValue(12);

    const where = { teamId: 1 };
    await expect(
      repository.findManyWithPagination({ where, skip: 10, take: 5, orderBy: { id: "asc" } })
    ).resolves.toEqual({ eventTypes: [{ id: 1 }], total: 12 });

    expect(lastArgs(prismaMock.eventType.findMany)).toEqual({
      where,
      skip: 10,
      take: 5,
      orderBy: { id: "asc" },
    });
    expect(lastArgs(prismaMock.eventType.count)).toEqual({ where });
  });
});

describe("listChildEventTypes", () => {
  beforeEach(() => {
    prismaMock.eventType.count.mockResolvedValue(3);
  });

  it("over-fetches by one and reports the next cursor when there are more rows", async () => {
    prismaMock.eventType.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    const result = await repository.listChildEventTypes({ parentEventTypeId: 1, limit: 2 });

    expect(lastArgs(prismaMock.eventType.findMany).take).toBe(3);
    expect(result).toMatchObject({ totalCount: 3, hasMore: true, nextCursor: 2 });
    expect(result.items.map((item) => item.id)).toEqual([1, 2]);
  });

  it("reports no next cursor on the last page", async () => {
    prismaMock.eventType.findMany.mockResolvedValue([{ id: 1 }]);

    const result = await repository.listChildEventTypes({ parentEventTypeId: 1, limit: 2 });

    expect(result).toMatchObject({ hasMore: false, nextCursor: null });
    expect(result.items).toHaveLength(1);
  });

  it("skips the cursor row when paginating", async () => {
    prismaMock.eventType.findMany.mockResolvedValue([]);

    await repository.listChildEventTypes({ parentEventTypeId: 1, limit: 2, cursor: 10 });

    const args = lastArgs(prismaMock.eventType.findMany);
    expect(args.skip).toBe(1);
    expect(args.cursor).toEqual({ id: 10 });
  });

  it("filters by owner name/email and excludes a user", async () => {
    prismaMock.eventType.findMany.mockResolvedValue([]);

    await repository.listChildEventTypes({
      parentEventTypeId: 1,
      limit: 2,
      excludeUserId: 5,
      searchTerm: "ali",
    });

    expect(lastArgs(prismaMock.eventType.findMany).where).toEqual({
      parentId: 1,
      userId: { not: 5 },
      owner: {
        OR: [
          { name: { contains: "ali", mode: "insensitive" } },
          { email: { contains: "ali", mode: "insensitive" } },
        ],
      },
    });
  });

  it("does not filter when no search term or excluded user is given", async () => {
    prismaMock.eventType.findMany.mockResolvedValue([]);

    await repository.listChildEventTypes({ parentEventTypeId: 1, limit: 2, searchTerm: null });

    expect(lastArgs(prismaMock.eventType.findMany).where).toEqual({ parentId: 1 });
  });
});
