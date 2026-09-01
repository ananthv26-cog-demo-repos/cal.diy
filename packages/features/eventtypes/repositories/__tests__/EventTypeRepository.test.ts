import { EventTypeRepository } from "@calcom/features/eventtypes/repositories/eventTypeRepository";
import { readonlyPrisma } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@calcom/prisma", () => ({
  userSelect: { id: true },
  availabilityUserSelect: { id: true },
  readonlyPrisma: {
    eventType: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
    },
    team: {
      findMany: vi.fn(),
    },
    membership: {
      findFirst: vi.fn(),
    },
  },
}));

describe("EventTypeRepository", () => {
  let eventTypeRepository: EventTypeRepository;

  beforeEach(() => {
    vi.resetAllMocks();
    eventTypeRepository = new EventTypeRepository(readonlyPrisma);
  });

  const mockUser = {
    id: 1,
    organizationId: 10,
    isOwnerAdminOfParentTeam: false,
  };

  const mockEventTypes = [
    {
      id: 1,
      slug: "personal-event",
      title: "Personal Event",
      teamId: null,
      userId: 1,
      team: null,
    },
    {
      id: 2,
      slug: "team-event",
      title: "Team Event",
      teamId: 5,
      userId: null,
      team: { name: "Team A" },
    },
  ];

  describe("getEventTypeList", () => {
    describe("Early return scenarios", () => {
      it("should return empty array when no teamId, userId, or isAll provided", async () => {
        const result = await eventTypeRepository.getEventTypeList({
          teamId: null,
          userId: null,
          isAll: false,
          user: mockUser,
        });

        expect(result).toEqual([]);
        expect(readonlyPrisma.eventType.findMany).not.toHaveBeenCalled();
      });
    });

    describe("Personal events filtering", () => {
      it("should return only user's personal events when userId provided", async () => {
        const personalEvents = [mockEventTypes[0]];
        vi.mocked(readonlyPrisma.eventType.findMany).mockResolvedValue(personalEvents);

        const result = await eventTypeRepository.getEventTypeList({
          teamId: null,
          userId: 1,
          isAll: false,
          user: mockUser,
        });

        expect(readonlyPrisma.eventType.findMany).toHaveBeenCalledWith({
          select: {
            id: true,
            slug: true,
            title: true,
            teamId: true,
            userId: true,
            team: {
              select: {
                name: true,
              },
            },
          },
          where: {
            userId: mockUser.id,
            teamId: null,
          },
        });
        expect(result).toEqual(personalEvents);
      });
    });

    describe("Organization-wide view (isAll = true)", () => {
      it("should return team events and user's personal events for owner/admin", async () => {
        const childTeams = [{ id: 11 }, { id: 12 }];
        const allEvents = [...mockEventTypes];

        vi.mocked(readonlyPrisma.team.findMany).mockResolvedValue(childTeams);
        vi.mocked(readonlyPrisma.eventType.findMany).mockResolvedValue(allEvents);

        const ownerUser = { ...mockUser, isOwnerAdminOfParentTeam: true };

        const result = await eventTypeRepository.getEventTypeList({
          teamId: null,
          userId: null,
          isAll: true,
          user: ownerUser,
        });

        expect(readonlyPrisma.eventType.findMany).toHaveBeenCalledWith({
          select: {
            id: true,
            slug: true,
            title: true,
            teamId: true,
            userId: true,
            team: {
              select: {
                name: true,
              },
            },
          },
          where: {
            OR: [
              {
                teamId: {
                  in: [10, 11, 12],
                },
              },
              {
                userId: ownerUser.id,
                teamId: null,
              },
            ],
          },
        });
        expect(result).toEqual(allEvents);
      });
    });

    describe("Team-specific view", () => {
      it("should return team events for team members", async () => {
        const membership = { teamId: 5, userId: 1, role: "MEMBER" };
        vi.mocked(readonlyPrisma.membership.findFirst).mockResolvedValue(membership);
        vi.mocked(readonlyPrisma.eventType.findMany).mockResolvedValue([mockEventTypes[1]]);

        const result = await eventTypeRepository.getEventTypeList({
          teamId: 5,
          userId: null,
          isAll: false,
          user: mockUser,
        });

        expect(readonlyPrisma.eventType.findMany).toHaveBeenCalledWith({
          select: {
            id: true,
            slug: true,
            title: true,
            teamId: true,
            userId: true,
            team: {
              select: {
                name: true,
              },
            },
          },
          where: {
            teamId: 5,
            OR: [{ userId: mockUser.id }, { users: { some: { id: mockUser.id } } }],
          },
        });
        expect(result).toEqual([mockEventTypes[1]]);
      });

      it("should throw error when user is not part of team and not owner/admin", async () => {
        vi.mocked(readonlyPrisma.membership.findFirst).mockResolvedValue(null);

        await expect(
          eventTypeRepository.getEventTypeList({
            teamId: 5,
            userId: null,
            isAll: false,
            user: mockUser,
          })
        ).rejects.toThrow("User is not part of a team/org");
      });
    });
  });

  describe("findParentEventTypeId", () => {
    it("returns the parentId of a managed child event type", async () => {
      vi.mocked(readonlyPrisma.eventType.findFirst).mockResolvedValue({ parentId: 7 });

      const result = await eventTypeRepository.findParentEventTypeId(3);

      expect(readonlyPrisma.eventType.findFirst).toHaveBeenCalledWith({
        where: { id: 3, parentId: { not: null } },
        select: { parentId: true },
      });
      expect(result).toBe(7);
    });

    it("returns null when the event type has no parent", async () => {
      vi.mocked(readonlyPrisma.eventType.findFirst).mockResolvedValue(null);

      expect(await eventTypeRepository.findParentEventTypeId(3)).toBeNull();
    });

    it("returns null when parentId is nullish on the found row", async () => {
      vi.mocked(readonlyPrisma.eventType.findFirst).mockResolvedValue({ parentId: null });

      expect(await eventTypeRepository.findParentEventTypeId(3)).toBeNull();
    });
  });

  describe("create", () => {
    it("converts foreign keys into prisma relation connects", async () => {
      vi.mocked(readonlyPrisma.eventType.create).mockResolvedValue({ id: 1 });

      await eventTypeRepository.create({
        title: "30 min",
        slug: "30min",
        length: 30,
        userId: 1,
        profileId: 2,
        teamId: 3,
        parentId: 4,
        scheduleId: 5,
      });

      expect(readonlyPrisma.eventType.create).toHaveBeenCalledWith({
        data: {
          title: "30 min",
          slug: "30min",
          length: 30,
          owner: { connect: { id: 1 } },
          profile: { connect: { id: 2 } },
          team: { connect: { id: 3 } },
          parent: { connect: { id: 4 } },
          schedule: { connect: { id: 5 } },
        },
        include: { calVideoSettings: true },
      });
    });

    it("omits relations for nullish foreign keys and passes through json fields", async () => {
      vi.mocked(readonlyPrisma.eventType.create).mockResolvedValue({ id: 1 });

      await eventTypeRepository.create({
        title: "30 min",
        slug: "30min",
        length: 30,
        userId: null,
        profileId: null,
        teamId: null,
        parentId: null,
        scheduleId: null,
        metadata: { someKey: "someValue" },
        bookingLimits: { PER_DAY: 2 },
        durationLimits: { PER_DAY: 60 },
        recurringEvent: { count: 3 },
        bookingFields: [{ name: "title" }],
      });

      expect(readonlyPrisma.eventType.create).toHaveBeenCalledWith({
        data: {
          title: "30 min",
          slug: "30min",
          length: 30,
          metadata: { someKey: "someValue" },
          bookingLimits: { PER_DAY: 2 },
          durationLimits: { PER_DAY: 60 },
          recurringEvent: { count: 3 },
          bookingFields: [{ name: "title" }],
        },
        include: { calVideoSettings: true },
      });
    });
  });

  describe("createMany", () => {
    it("maps every entry through the same create data transform", async () => {
      vi.mocked(readonlyPrisma.eventType.createMany).mockResolvedValue({ count: 2 });

      await eventTypeRepository.createMany([
        { title: "a", slug: "a", length: 15, userId: 1 },
        { title: "b", slug: "b", length: 30, teamId: 2 },
      ]);

      expect(readonlyPrisma.eventType.createMany).toHaveBeenCalledWith({
        data: [
          { title: "a", slug: "a", length: 15, owner: { connect: { id: 1 } } },
          { title: "b", slug: "b", length: 30, team: { connect: { id: 2 } } },
        ],
      });
    });
  });

  describe("findFirstEventTypeId", () => {
    it("uses the teamId_slug compound key when a teamId is given", async () => {
      vi.mocked(readonlyPrisma.eventType.findUnique).mockResolvedValue({ id: 9 });

      const result = await eventTypeRepository.findFirstEventTypeId({ slug: "30min", teamId: 5 });

      expect(readonlyPrisma.eventType.findUnique).toHaveBeenCalledWith({
        where: { teamId_slug: { teamId: 5, slug: "30min" } },
        select: { id: true },
      });
      expect(result).toEqual({ id: 9 });
    });

    it("uses the userId_slug compound key when only a userId is given", async () => {
      vi.mocked(readonlyPrisma.eventType.findUnique).mockResolvedValue({ id: 10 });

      await eventTypeRepository.findFirstEventTypeId({ slug: "30min", userId: 3 });

      expect(readonlyPrisma.eventType.findUnique).toHaveBeenCalledWith({
        where: { userId_slug: { userId: 3, slug: "30min" } },
        select: { id: true },
      });
    });

    it("falls back to findFirst by slug when neither teamId nor userId is given", async () => {
      vi.mocked(readonlyPrisma.eventType.findFirst).mockResolvedValue(null);

      const result = await eventTypeRepository.findFirstEventTypeId({ slug: "30min" });

      expect(readonlyPrisma.eventType.findFirst).toHaveBeenCalledWith({
        where: { slug: "30min" },
        select: { id: true },
      });
      expect(readonlyPrisma.eventType.findUnique).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe("findEventTypesWithoutChildren", () => {
    it("restricts to parent event types when a teamId is given", async () => {
      vi.mocked(readonlyPrisma.eventType.findMany).mockResolvedValue([]);

      await eventTypeRepository.findEventTypesWithoutChildren([1, 2], 5);

      expect(readonlyPrisma.eventType.findMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] }, parentId: null },
        select: { id: true, children: { select: { id: true } } },
      });
    });

    it("does not restrict on parentId for personal event types", async () => {
      vi.mocked(readonlyPrisma.eventType.findMany).mockResolvedValue([]);

      await eventTypeRepository.findEventTypesWithoutChildren([1], null);

      expect(readonlyPrisma.eventType.findMany).toHaveBeenCalledWith({
        where: { id: { in: [1] } },
        select: { id: true, children: { select: { id: true } } },
      });
    });
  });

  describe("findAllIncludingChildrenByUserId", () => {
    it("returns an empty array without querying when userId is null", async () => {
      const result = await eventTypeRepository.findAllIncludingChildrenByUserId({ userId: null });

      expect(result).toEqual([]);
      expect(readonlyPrisma.eventType.findMany).not.toHaveBeenCalled();
    });

    it("queries event types with their children for a user", async () => {
      const rows = [{ id: 1, children: [{ id: 2 }] }];
      vi.mocked(readonlyPrisma.eventType.findMany).mockResolvedValue(rows);

      const result = await eventTypeRepository.findAllIncludingChildrenByUserId({ userId: 4 });

      expect(readonlyPrisma.eventType.findMany).toHaveBeenCalledWith({
        where: { userId: 4 },
        select: { id: true, children: { select: { id: true } } },
      });
      expect(result).toEqual(rows);
    });
  });

  describe("findManyChildEventTypes", () => {
    it("excludes the given user when excludeUserId is provided", async () => {
      vi.mocked(readonlyPrisma.eventType.findMany).mockResolvedValue([]);

      await eventTypeRepository.findManyChildEventTypes(1, 8);

      expect(readonlyPrisma.eventType.findMany).toHaveBeenCalledWith({
        where: { parentId: 1, userId: { not: 8 } },
        select: { id: true, userId: true },
      });
    });

    it("does not filter by user when excludeUserId is omitted", async () => {
      vi.mocked(readonlyPrisma.eventType.findMany).mockResolvedValue([]);

      await eventTypeRepository.findManyChildEventTypes(1);

      expect(readonlyPrisma.eventType.findMany).toHaveBeenCalledWith({
        where: { parentId: 1 },
        select: { id: true, userId: true },
      });
    });

    it("filters out children without an owner when excludeUserId is null", async () => {
      vi.mocked(readonlyPrisma.eventType.findMany).mockResolvedValue([]);

      await eventTypeRepository.findManyChildEventTypes(1, null);

      expect(readonlyPrisma.eventType.findMany).toHaveBeenCalledWith({
        where: { parentId: 1, userId: { not: null } },
        select: { id: true, userId: true },
      });
    });
  });

  describe("listChildEventTypes", () => {
    it("over-fetches by one and reports hasMore with the next cursor", async () => {
      vi.mocked(readonlyPrisma.eventType.count).mockResolvedValue(5);
      vi.mocked(readonlyPrisma.eventType.findMany).mockResolvedValue([
        { id: 1, userId: 1, owner: null },
        { id: 2, userId: 2, owner: null },
        { id: 3, userId: 3, owner: null },
      ]);

      const result = await eventTypeRepository.listChildEventTypes({
        parentEventTypeId: 100,
        limit: 2,
      });

      expect(vi.mocked(readonlyPrisma.eventType.findMany).mock.calls[0][0]).toMatchObject({
        where: { parentId: 100 },
        take: 3,
        orderBy: { id: "asc" },
      });
      expect(result.items.map((item) => item.id)).toEqual([1, 2]);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe(2);
      expect(result.totalCount).toBe(5);
    });

    it("reports no next page when fewer rows than the limit are returned", async () => {
      vi.mocked(readonlyPrisma.eventType.count).mockResolvedValue(1);
      vi.mocked(readonlyPrisma.eventType.findMany).mockResolvedValue([{ id: 1, userId: 1, owner: null }]);

      const result = await eventTypeRepository.listChildEventTypes({
        parentEventTypeId: 100,
        limit: 2,
      });

      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
      expect(result.items).toHaveLength(1);
    });

    it("skips the cursor row when paginating", async () => {
      vi.mocked(readonlyPrisma.eventType.count).mockResolvedValue(3);
      vi.mocked(readonlyPrisma.eventType.findMany).mockResolvedValue([]);

      await eventTypeRepository.listChildEventTypes({
        parentEventTypeId: 100,
        limit: 10,
        cursor: 42,
      });

      expect(vi.mocked(readonlyPrisma.eventType.findMany).mock.calls[0][0]).toMatchObject({
        skip: 1,
        cursor: { id: 42 },
      });
    });

    it("searches the owner name and email case-insensitively and excludes a user", async () => {
      vi.mocked(readonlyPrisma.eventType.count).mockResolvedValue(0);
      vi.mocked(readonlyPrisma.eventType.findMany).mockResolvedValue([]);

      await eventTypeRepository.listChildEventTypes({
        parentEventTypeId: 100,
        limit: 10,
        searchTerm: "ali",
        excludeUserId: 8,
      });

      const expectedWhere = {
        parentId: 100,
        userId: { not: 8 },
        owner: {
          OR: [
            { name: { contains: "ali", mode: "insensitive" } },
            { email: { contains: "ali", mode: "insensitive" } },
          ],
        },
      };

      expect(vi.mocked(readonlyPrisma.eventType.findMany).mock.calls[0][0]).toMatchObject({
        where: expectedWhere,
      });
      expect(readonlyPrisma.eventType.count).toHaveBeenCalledWith({ where: expectedWhere });
    });
  });
});
