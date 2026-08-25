import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  enrichUserWithItsProfile,
  findById,
  findByIdForOrgAdmin,
  getBookingFieldsWithSystemFields,
  getLocationGroupedOptions,
} = vi.hoisted(() => ({
  enrichUserWithItsProfile: vi.fn(),
  findById: vi.fn(),
  findByIdForOrgAdmin: vi.fn(),
  getBookingFieldsWithSystemFields: vi.fn(() => []),
  getLocationGroupedOptions: vi.fn(async () => [{ label: "Conferencing", options: [] }]),
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: class {
    enrichUserWithItsProfile = enrichUserWithItsProfile;
  },
}));

vi.mock("@calcom/features/eventtypes/repositories/eventTypeRepository", () => ({
  EventTypeRepository: class {
    findById = findById;
    findByIdForOrgAdmin = findByIdForOrgAdmin;
  },
}));

vi.mock("@calcom/features/bookings/lib/getBookingFields", () => ({
  getBookingFieldsWithSystemFields,
}));

vi.mock("@calcom/app-store/server", () => ({ getLocationGroupedOptions }));

import { getEventTypeById, getRawEventType } from "./getEventTypeById";

function createPrismaMock() {
  return {
    team: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    destinationCalendar: { findFirst: vi.fn() },
  };
}

type PrismaMock = ReturnType<typeof createPrismaMock>;
let prismaMock: PrismaMock;

function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Alice",
    username: "alice",
    email: "alice@example.com",
    avatarUrl: null,
    locale: "en",
    defaultScheduleId: 7,
    isPlatformManaged: false,
    timeZone: "UTC",
    ...overrides,
  };
}

function buildRawEventType(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    title: "30 min",
    slug: "30min",
    length: 30,
    teamId: null,
    team: null,
    owner: null,
    users: [buildUser()],
    children: [],
    customInputs: [],
    locations: [],
    metadata: {},
    schedule: null,
    instantMeetingSchedule: null,
    restrictionSchedule: null,
    restrictionScheduleId: null,
    useBookerTimezone: null,
    recurringEvent: null,
    bookingLimits: null,
    durationLimits: null,
    eventTypeColor: null,
    periodStartDate: null,
    periodEndDate: null,
    destinationCalendar: null,
    schedulingType: null,
    ...overrides,
  };
}

const call = (overrides: Record<string, unknown> = {}) =>
  getEventTypeById({
    eventTypeId: 10,
    userId: 1,
    prisma: prismaMock as never,
    isUserOrganizationAdmin: false,
    currentOrganizationId: null,
    ...overrides,
  });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock = createPrismaMock();
  enrichUserWithItsProfile.mockImplementation(async ({ user }: { user: Record<string, unknown> }) => ({
    ...user,
    profile: { id: 100 },
    eventTypes: [],
  }));
  getBookingFieldsWithSystemFields.mockReturnValue([]);
  getLocationGroupedOptions.mockResolvedValue([{ label: "Conferencing", options: [] }]);
  findById.mockResolvedValue(buildRawEventType());
  findByIdForOrgAdmin.mockResolvedValue(null);
});

describe("getRawEventType", () => {
  const args = {
    userId: 1,
    eventTypeId: 10,
    isUserOrganizationAdmin: false,
    currentOrganizationId: null,
  };

  it("looks the event type up for the requesting user", async () => {
    await getRawEventType({ ...args, prisma: prismaMock as never });

    expect(findById).toHaveBeenCalledWith({ id: 10, userId: 1 });
    expect(prismaMock.team.findUnique).not.toHaveBeenCalled();
  });

  it("uses the org admin lookup only for platform organizations", async () => {
    prismaMock.team.findUnique.mockResolvedValue({ isPlatform: true });
    findByIdForOrgAdmin.mockResolvedValue(buildRawEventType({ id: 99 }));

    const result = await getRawEventType({
      ...args,
      isUserOrganizationAdmin: true,
      currentOrganizationId: 5,
      prisma: prismaMock as never,
    });

    expect(findByIdForOrgAdmin).toHaveBeenCalledWith({ id: 10, organizationId: 5 });
    expect(findById).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 99 });
  });

  it("falls back to the user lookup for non platform organizations", async () => {
    prismaMock.team.findUnique.mockResolvedValue({ isPlatform: false });

    await getRawEventType({
      ...args,
      isUserOrganizationAdmin: true,
      currentOrganizationId: 5,
      prisma: prismaMock as never,
    });

    expect(findByIdForOrgAdmin).not.toHaveBeenCalled();
    expect(findById).toHaveBeenCalled();
  });

  it("falls back to the user lookup when the org admin lookup finds nothing", async () => {
    prismaMock.team.findUnique.mockResolvedValue({ isPlatform: true });
    findByIdForOrgAdmin.mockResolvedValue(null);

    await getRawEventType({
      ...args,
      isUserOrganizationAdmin: true,
      currentOrganizationId: 5,
      prisma: prismaMock as never,
    });

    expect(findById).toHaveBeenCalled();
  });
});

describe("getEventTypeById", () => {
  it("throws a plain error when the event type is missing", async () => {
    findById.mockResolvedValue(null);

    await expect(call()).rejects.toThrow("Event type not found");
  });

  it("throws a NOT_FOUND trpc error when called from trpc", async () => {
    findById.mockResolvedValue(null);

    await expect(call({ isTrpcCall: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("parses metadata, custom inputs and limits for a personal event type", async () => {
    findById.mockResolvedValue(
      buildRawEventType({
        metadata: { multipleDuration: [15, 30] },
        customInputs: [
          { id: 1, eventTypeId: 10, label: "Ref", type: "TEXT", required: false, placeholder: "" },
        ],
        bookingLimits: { PER_DAY: 2 },
        durationLimits: { PER_DAY: 60 },
        recurringEvent: { freq: 2, count: 3, interval: 1 },
        eventTypeColor: { lightEventTypeColor: "#111111", darkEventTypeColor: "#222222" },
      })
    );

    const { eventType } = await call();

    expect(eventType.metadata).toMatchObject({ multipleDuration: [15, 30] });
    expect(eventType.customInputs).toHaveLength(1);
    expect(eventType.bookingLimits).toEqual({ PER_DAY: 2 });
    expect(eventType.durationLimits).toEqual({ PER_DAY: 60 });
    expect(eventType.recurringEvent).toMatchObject({ count: 3 });
    expect(eventType.eventTypeColor).toMatchObject({ lightEventTypeColor: "#111111" });
  });

  it("falls back to the owner's default schedule when the event type has none", async () => {
    const { eventType } = await call();
    expect(eventType.schedule).toBe(7);
  });

  it("prefers the event type's own schedule and exposes its name", async () => {
    findById.mockResolvedValue(
      buildRawEventType({
        schedule: { id: 3, name: "Working hours" },
        instantMeetingSchedule: { id: 4 },
        restrictionSchedule: { name: "Restriction" },
        restrictionScheduleId: 9,
        useBookerTimezone: true,
      })
    );

    const { eventType } = await call();

    expect(eventType).toMatchObject({
      schedule: 3,
      scheduleName: "Working hours",
      instantMeetingSchedule: 4,
      restrictionScheduleId: 9,
      restrictionScheduleName: "Restriction",
      useBookerTimezone: true,
    });
  });

  it("adds a fallback user when the event type has neither users nor a team", async () => {
    findById.mockResolvedValue(buildRawEventType({ users: [] }));
    prismaMock.user.findUnique.mockResolvedValue(buildUser());

    const { eventType } = await call();

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1 } }));
    expect(eventType.users).toHaveLength(0);
  });

  it("throws when no fallback user exists", async () => {
    findById.mockResolvedValue(buildRawEventType({ users: [] }));
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(call()).rejects.toThrow("no fallback user was found");
  });

  it("throws a trpc error when no fallback user exists in a trpc call", async () => {
    findById.mockResolvedValue(buildRawEventType({ users: [] }));
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(call({ isTrpcCall: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws when neither a matching user nor a team can be resolved", async () => {
    findById.mockResolvedValue(buildRawEventType({ users: [buildUser({ id: 2 })] }));

    await expect(call()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("prepends the members default location for managed event types", async () => {
    findById.mockResolvedValue(
      buildRawEventType({
        schedulingType: "MANAGED",
        teamId: 3,
        team: { id: 3, parentId: null, members: [] },
      })
    );

    const { locationOptions } = await call();

    expect(locationOptions[0].options[0]).toMatchObject({ value: "", icon: "/user-check.svg" });
    expect(getLocationGroupedOptions).toHaveBeenCalledWith({ teamId: 3 }, expect.any(Function));
  });

  it("queries the location options for the user when the event type has no team", async () => {
    await call();

    expect(getLocationGroupedOptions).toHaveBeenCalledWith({ userId: 1 }, expect.any(Function));
  });

  it("returns only accepted team members for a regular team event", async () => {
    findById.mockResolvedValue(
      buildRawEventType({
        teamId: 3,
        team: {
          id: 3,
          parentId: null,
          members: [
            { accepted: true, role: "OWNER", user: buildUser() },
            { accepted: false, role: "MEMBER", user: buildUser({ id: 2, username: "bob" }) },
          ],
        },
      })
    );

    const { teamMembers, currentUserMembership } = await call();

    expect(teamMembers).toHaveLength(1);
    expect(teamMembers[0]).toMatchObject({ membership: "OWNER", profileId: 100, eventTypes: [] });
    expect(currentUserMembership).toMatchObject({ role: "OWNER" });
  });

  it("returns pending members too for organization event types", async () => {
    findById.mockResolvedValue(
      buildRawEventType({
        teamId: 3,
        team: {
          id: 3,
          parentId: 1,
          members: [
            { accepted: false, role: "MEMBER", user: buildUser() },
            { accepted: false, role: "MEMBER", user: buildUser({ id: 2 }) },
          ],
        },
      })
    );

    const { teamMembers } = await call();

    expect(teamMembers).toHaveLength(2);
    expect(getBookingFieldsWithSystemFields).toHaveBeenCalledWith(
      expect.objectContaining({ isOrgTeamEvent: true })
    );
  });

  it("maps managed children to their owners and their membership role", async () => {
    findById.mockResolvedValue(
      buildRawEventType({
        teamId: 3,
        team: {
          id: 3,
          parentId: null,
          members: [{ accepted: true, role: "ADMIN", user: buildUser({ id: 2, name: "Bob" }) }],
        },
        children: [
          { id: 11, owner: buildUser({ id: 2, name: "Bob", username: "bob" }) },
          { id: 12, owner: null },
        ],
      })
    );

    const { eventType } = await call();

    expect(eventType.children).toHaveLength(1);
    expect(eventType.children[0]).toMatchObject({
      created: true,
      owner: { membership: "ADMIN", name: "Bob", username: "bob" },
    });
  });

  it("defaults a child owner without a team membership to MEMBER", async () => {
    findById.mockResolvedValue(
      buildRawEventType({
        teamId: 3,
        team: { id: 3, parentId: null, members: [] },
        children: [{ id: 11, owner: buildUser({ id: 5, name: null, username: null }) }],
      })
    );

    const { eventType } = await call();

    expect(eventType.children[0].owner).toMatchObject({ membership: "MEMBER", name: "", username: "" });
  });

  it("falls back to the user's default destination calendar", async () => {
    prismaMock.destinationCalendar.findFirst.mockResolvedValue({ id: 4, integration: "google_calendar" });

    const { destinationCalendar } = await call();

    expect(prismaMock.destinationCalendar.findFirst).toHaveBeenCalledWith({
      where: { userId: 1, eventTypeId: null },
    });
    expect(destinationCalendar).toMatchObject({ id: 4 });
  });

  it("keeps the event type's own destination calendar", async () => {
    findById.mockResolvedValue(buildRawEventType({ destinationCalendar: { id: 9 } }));

    const { destinationCalendar } = await call();

    expect(prismaMock.destinationCalendar.findFirst).not.toHaveBeenCalled();
    expect(destinationCalendar).toMatchObject({ id: 9 });
  });

  it("serialises the period dates and exposes the organization admin flag", async () => {
    const periodStartDate = new Date("2024-01-01T00:00:00.000Z");
    findById.mockResolvedValue(buildRawEventType({ periodStartDate, periodEndDate: null }));

    const result = await call({ isUserOrganizationAdmin: true, userLocale: "en" });

    expect(result.eventType.periodStartDate).toBe(periodStartDate.toString());
    expect(result.eventType.periodEndDate).toBeNull();
    expect(result.isUserOrganizationAdmin).toBe(true);
  });
});
