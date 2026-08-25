import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  enrichUsersWithTheirProfiles,
  enrichUserWithItsProfile,
  findUsersByUsername,
  getBookingFieldsWithSystemFields,
} = vi.hoisted(() => ({
  enrichUsersWithTheirProfiles: vi.fn(),
  enrichUserWithItsProfile: vi.fn(),
  findUsersByUsername: vi.fn(),
  getBookingFieldsWithSystemFields: vi.fn(() => []),
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: class {
    enrichUsersWithTheirProfiles = enrichUsersWithTheirProfiles;
    enrichUserWithItsProfile = enrichUserWithItsProfile;
    findUsersByUsername = findUsersByUsername;
  },
}));

vi.mock("@calcom/features/bookings/lib/getBookingFields", () => ({
  getBookingFieldsWithSystemFields,
}));

import {
  getEventTypeHosts,
  getProfileFromEvent,
  getPublicEvent,
  getPublicEventSelect,
  getUsersFromEvent,
  processEventDataShared,
} from "./getPublicEvent";

function createPrismaMock() {
  return {
    eventType: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn() },
    team: { findFirst: vi.fn(), findFirstOrThrow: vi.fn() },
    schedule: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  };
}

type PrismaMock = ReturnType<typeof createPrismaMock>;
let prismaMock: PrismaMock;

function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    username: "alice",
    name: "Alice",
    avatarUrl: null,
    weekStart: "Monday",
    brandColor: "#111111",
    darkBrandColor: "#eeeeee",
    theme: null,
    metadata: null,
    defaultScheduleId: null,
    profile: { organization: null, organizationId: null },
    ...overrides,
  };
}

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    title: "30 min",
    description: "**bold**",
    interfaceLanguage: "en",
    slug: "30min",
    length: 30,
    locations: [],
    customInputs: [],
    metadata: {},
    recurringEvent: null,
    isInstantEvent: false,
    instantMeetingParameters: [],
    instantMeetingSchedule: null,
    schedule: { id: 1, timeZone: "Europe/London" },
    teamId: null,
    team: null,
    parent: null,
    hosts: [],
    owner: buildUser(),
    assignAllTeamMembers: false,
    disableCancelling: false,
    disableRescheduling: false,
    allowReschedulingCancelledBookings: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock = createPrismaMock();
  enrichUsersWithTheirProfiles.mockImplementation(async (users: Record<string, unknown>[]) =>
    users.map((user) => ({ ...user, profile: user.profile ?? { organization: null } }))
  );
  enrichUserWithItsProfile.mockImplementation(async ({ user }: { user: Record<string, unknown> }) => ({
    ...user,
    profile: user.profile ?? { organization: null },
  }));
  getBookingFieldsWithSystemFields.mockReturnValue([]);
});

const call = (
  args: Partial<{
    username: string;
    eventSlug: string;
    isTeamEvent: boolean | undefined;
    org: string | null;
    fromRedirectOfNonOrgLink: boolean;
    currentUserId: number | undefined;
    fetchAllUsers: boolean;
  }> = {}
) =>
  getPublicEvent(
    args.username ?? "alice",
    args.eventSlug ?? "30min",
    args.isTeamEvent,
    args.org ?? null,
    prismaMock as never,
    args.fromRedirectOfNonOrgLink ?? false,
    args.currentUserId,
    args.fetchAllUsers ?? false
  );

describe("getPublicEventSelect", () => {
  it("limits hosts to 3 unless all users are requested", () => {
    expect(getPublicEventSelect(false).hosts).toMatchObject({ take: 3 });
    expect(getPublicEventSelect(true).hosts).not.toHaveProperty("take");
  });
});

describe("getPublicEvent - dynamic group events", () => {
  beforeEach(() => {
    findUsersByUsername.mockResolvedValue([
      buildUser({ id: 1, username: "alice" }),
      buildUser({ id: 2, username: "bob", weekStart: "Sunday" }),
    ]);
  });

  it("returns the default dynamic event enriched with the group's users", async () => {
    const event = await call({ username: "alice+bob" });

    expect(findUsersByUsername).toHaveBeenCalledWith({ usernameList: ["alice", "bob"], orgSlug: null });
    expect(event).toMatchObject({
      slug: "dynamic",
      isInstantEvent: false,
      showInstantEventConnectNowModal: false,
      autoTranslateDescriptionEnabled: false,
    });
    expect(event.subsetOfUsers.map((user: { username: string }) => user.username)).toEqual(["alice", "bob"]);
    expect(event.users).toBeUndefined();
    expect(prismaMock.eventType.findFirst).not.toHaveBeenCalled();
  });

  it("returns the full user list when all users are requested", async () => {
    const event = await call({ username: "alice+bob", fetchAllUsers: true });
    expect(event.users).toHaveLength(2);
  });

  it("uses the first user's preferred conferencing app as the location", async () => {
    findUsersByUsername.mockResolvedValue([
      buildUser({ metadata: { defaultConferencingApp: { appSlug: "google-meet" } } }),
      buildUser({ id: 2, username: "bob" }),
    ]);

    const event = await call({ username: "alice+bob" });

    expect(event.locations).toEqual([{ type: "integrations:google:meet", link: undefined }]);
  });

  it("keeps the default location when the preferred app is unknown", async () => {
    findUsersByUsername.mockResolvedValue([
      buildUser({ metadata: { defaultConferencingApp: { appSlug: "not-an-app" } } }),
      buildUser({ id: 2, username: "bob" }),
    ]);

    const event = await call({ username: "alice+bob" });

    expect(event.locations).toEqual([{ type: "integrations:daily" }]);
  });

  it("adds the organization branding when booking inside an org", async () => {
    prismaMock.team.findFirstOrThrow.mockResolvedValue({ logoUrl: "logo.png", name: "Acme" });

    const event = await call({ username: "alice+bob", org: "acme" });

    expect(prismaMock.team.findFirstOrThrow).toHaveBeenCalled();
    expect(event.profile).toMatchObject({ name: "Acme", username: "acme" });
    expect(event.entity.orgSlug).toBe("acme");
  });

  it("flags unpublished organizations unless the booker came from a non-org link", async () => {
    findUsersByUsername.mockResolvedValue([
      buildUser({ profile: { organization: { slug: null, name: "Acme" } } }),
      buildUser({ id: 2, username: "bob" }),
    ]);

    const unpublished = await call({ username: "alice+bob" });
    expect(unpublished.entity).toMatchObject({ considerUnpublished: true, name: "Acme" });

    const redirected = await call({ username: "alice+bob", fromRedirectOfNonOrgLink: true });
    expect(redirected.entity.considerUnpublished).toBe(false);
  });
});

describe("getPublicEvent - single user and team events", () => {
  it("queries a personal event outside of an organization", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(buildEvent());

    await call();

    expect(prismaMock.eventType.findFirst.mock.calls[0][0].where).toMatchObject({
      slug: "30min",
      users: { some: { username: "alice", profiles: { none: {} } } },
      team: null,
    });
  });

  it("queries a personal event inside an organization by profile", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(buildEvent());
    prismaMock.team.findFirst.mockResolvedValue(null);

    await call({ org: "acme" });

    expect(prismaMock.eventType.findFirst.mock.calls[0][0].where.users.some.profiles.some).toEqual({
      organization: { slug: "acme" },
      username: "alice",
    });
  });

  it("queries a team event by team slug and parent org", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(
      buildEvent({ teamId: 3, team: { slug: "team", name: "Team", metadata: {} }, owner: null, hosts: [] })
    );
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue({ users: [buildUser()] });
    prismaMock.team.findFirst.mockResolvedValue(null);

    await call({ username: "team", isTeamEvent: true, org: "acme" });

    expect(prismaMock.eventType.findFirst.mock.calls[0][0].where.team).toEqual({
      slug: "team",
      parent: { slug: "acme" },
    });
  });

  it("falls back to a platform organization lookup when nothing matched", async () => {
    prismaMock.eventType.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(buildEvent());

    const event = await call();

    expect(prismaMock.eventType.findFirst).toHaveBeenCalledTimes(2);
    expect(prismaMock.eventType.findFirst.mock.calls[1][0].where.users.some).toMatchObject({
      username: "alice",
      isPlatformManaged: false,
    });
    expect(event).not.toBeNull();
  });

  it("does not run the platform fallback inside an org context and returns null", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(null);

    await expect(call({ org: "acme" })).resolves.toBeNull();
    expect(prismaMock.eventType.findFirst).toHaveBeenCalledTimes(1);
  });

  it("renders markdown, parses metadata and exposes the owner as the only user", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(
      buildEvent({ metadata: { multipleDuration: [15, 30] } })
    );

    const event = await call();

    expect(event?.description).toContain("<strong>bold</strong>");
    expect(event?.metadata).toMatchObject({ multipleDuration: [15, 30] });
    expect(event?.subsetOfUsers).toHaveLength(1);
    expect(event?.users).toBeUndefined();
    expect(event?.isDynamic).toBe(false);
  });

  it("parses a recurring event and leaves non recurring events null", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(
      buildEvent({ recurringEvent: { freq: 2, count: 3, interval: 1 } })
    );
    const recurring = await call();
    expect(recurring?.recurringEvent).toMatchObject({ count: 3 });

    prismaMock.eventType.findFirst.mockResolvedValue(buildEvent());
    const single = await call();
    expect(single?.recurringEvent).toBeNull();
  });

  it("falls back to the owner's default schedule when the event has none", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(
      buildEvent({ schedule: null, owner: buildUser({ defaultScheduleId: 55 }) })
    );
    prismaMock.schedule.findUnique.mockResolvedValue({ id: 55, timeZone: "UTC" });

    const event = await call();

    expect(prismaMock.schedule.findUnique).toHaveBeenCalledWith({
      where: { id: 55 },
      select: { id: true, timeZone: true },
    });
    expect(event?.schedule).toEqual({ id: 55, timeZone: "UTC" });
  });

  it("throws when the event has neither an owner nor users", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(buildEvent({ owner: null }));
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue({ users: [] });

    await expect(call()).rejects.toThrow("has no owner or users");
  });

  it("falls back to the users array of a legacy team event without hosts", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(
      buildEvent({ teamId: 3, team: { slug: "team", name: "Team", metadata: {} }, owner: null })
    );
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue({ users: [buildUser()] });

    const event = await call({ username: "team", isTeamEvent: true });

    expect(event?.subsetOfUsers).toHaveLength(1);
  });

  it("hides the members of a private team from anonymous bookers", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(
      buildEvent({
        teamId: 3,
        team: { slug: "team", name: "Team", metadata: {}, isPrivate: true },
        owner: null,
        hosts: [{ user: buildUser() }],
      })
    );

    const event = await call({ username: "team", isTeamEvent: true });

    expect(event?.subsetOfUsers).toEqual([]);
  });

  it("shows the members of a private team to a permitted user", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(
      buildEvent({
        teamId: 3,
        team: { slug: "team", name: "Team", metadata: {}, isPrivate: true, parentId: 4 },
        owner: null,
        hosts: [{ user: buildUser() }],
      })
    );

    const event = await call({ username: "team", isTeamEvent: true, currentUserId: 7 });

    expect(event?.subsetOfUsers).toHaveLength(1);
  });

  it("checks instant availability for instant events", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(
      buildEvent({ isInstantEvent: true, instantMeetingSchedule: { id: 3, timeZone: null } })
    );
    prismaMock.schedule.findUniqueOrThrow.mockResolvedValue({ availability: [] });

    const event = await call();

    expect(prismaMock.schedule.findUniqueOrThrow).toHaveBeenCalled();
    expect(event?.showInstantEventConnectNowModal).toBe(false);
    expect(event?.isInstantEvent).toBe(true);
  });

  it("derives the entity from the team and the organization details", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(
      buildEvent({
        teamId: 3,
        owner: null,
        hosts: [{ user: buildUser() }],
        team: {
          slug: "team",
          name: "Team",
          metadata: {},
          hideTeamProfileLink: true,
          parent: { slug: "acme", name: "Acme" },
        },
      })
    );
    prismaMock.team.findFirst.mockResolvedValue({ logoUrl: "logo.png", name: "Acme Org" });

    const event = await call({ username: "team", isTeamEvent: true, org: "acme" });

    expect(event?.entity).toMatchObject({
      teamSlug: "team",
      orgSlug: "acme",
      name: "Acme Org",
      hideProfileLink: true,
      considerUnpublished: false,
    });
  });

  it("uses the requested slug from team metadata for unpublished teams", async () => {
    prismaMock.eventType.findFirst.mockResolvedValue(
      buildEvent({
        teamId: 3,
        owner: null,
        hosts: [{ user: buildUser() }],
        team: { slug: null, name: "Team", metadata: { requestedSlug: "pending-team" } },
      })
    );

    const event = await call({ username: "team", isTeamEvent: true });

    expect(event?.entity).toMatchObject({ teamSlug: "pending-team", considerUnpublished: true });
  });
});

describe("getEventTypeHosts", () => {
  it("returns only a subset of hosts by default", async () => {
    const hosts = [{ user: buildUser() }, { user: buildUser({ id: 2, username: "bob" }) }];

    const result = await getEventTypeHosts({ hosts: hosts as never, prisma: prismaMock as never });

    expect(result.subsetOfHosts).toHaveLength(2);
    expect(result.hosts).toBeUndefined();
  });

  it("returns all hosts when requested", async () => {
    const hosts = [{ user: buildUser() }];

    const result = await getEventTypeHosts({
      hosts: hosts as never,
      fetchAllUsers: true,
      prisma: prismaMock as never,
    });

    expect(result.hosts).toHaveLength(1);
  });
});

describe("getProfileFromEvent", () => {
  const baseEvent = {
    metadata: {},
    parent: null,
    team: null,
    owner: null,
    subsetOfHosts: [],
  };

  it("prefers the team profile", () => {
    const profile = getProfileFromEvent({
      ...baseEvent,
      team: {
        slug: "team",
        name: "Team",
        metadata: {},
        brandColor: "#123456",
        darkBrandColor: "#654321",
        theme: "dark",
        logoUrl: null,
      },
    } as never);

    expect(profile).toMatchObject({ username: "team", name: "Team", theme: "dark" });
  });

  it("falls back to the first host and its week start", () => {
    const profile = getProfileFromEvent({
      ...baseEvent,
      subsetOfHosts: [{ user: buildUser({ weekStart: "Sunday" }) }],
    } as never);

    expect(profile).toMatchObject({ username: "alice", weekStart: "Sunday" });
  });

  it("falls back to the owner and a Monday week start", () => {
    const profile = getProfileFromEvent({
      ...baseEvent,
      owner: buildUser({ weekStart: null }),
    } as never);

    expect(profile).toMatchObject({ username: "alice", weekStart: "Monday" });
  });

  it("uses the parent team for styling when the event has no team of its own", () => {
    const profile = getProfileFromEvent({
      ...baseEvent,
      owner: buildUser(),
      parent: { team: { brandColor: "#aaaaaa", darkBrandColor: "#bbbbbb", theme: "light" } },
    } as never);

    expect(profile).toMatchObject({ brandColor: "#aaaaaa", theme: "light" });
  });

  it("prefers the event booker layouts over the user's default layouts", () => {
    const withEventLayouts = getProfileFromEvent({
      ...baseEvent,
      metadata: { bookerLayouts: { enabledLayouts: ["week_view"], defaultLayout: "week_view" } },
      owner: buildUser({
        metadata: { defaultBookerLayouts: { enabledLayouts: ["month_view"], defaultLayout: "month_view" } },
      }),
    } as never);
    expect(withEventLayouts.bookerLayouts).toMatchObject({ defaultLayout: "week_view" });

    const withUserLayouts = getProfileFromEvent({
      ...baseEvent,
      owner: buildUser({
        metadata: { defaultBookerLayouts: { enabledLayouts: ["month_view"], defaultLayout: "month_view" } },
      }),
    } as never);
    expect(withUserLayouts.bookerLayouts).toMatchObject({ defaultLayout: "month_view" });
  });

  it("throws when the event has neither team, host nor owner", () => {
    expect(() => getProfileFromEvent(baseEvent as never)).toThrow("Event has no owner");
  });
});

describe("getUsersFromEvent", () => {
  it("maps the hosts of a team event and skips hosts without a username", async () => {
    const users = await getUsersFromEvent(
      {
        id: 1,
        team: { slug: "team" },
        owner: null,
        subsetOfHosts: [
          { user: buildUser({ profile: { organizationId: 9, organization: { slug: "acme" } } }) },
          { user: buildUser({ id: 2, username: null }) },
        ],
      } as never,
      prismaMock as never
    );

    expect(users).toHaveLength(1);
    expect(users?.[0]).toMatchObject({ username: "alice", organizationId: 9 });
  });

  it("prefers the full host list when it is present", async () => {
    const users = await getUsersFromEvent(
      {
        id: 1,
        team: { slug: "team" },
        owner: null,
        hosts: [{ user: buildUser({ username: "carol" }) }],
        subsetOfHosts: [{ user: buildUser() }],
      } as never,
      prismaMock as never
    );

    expect(users?.[0]).toMatchObject({ username: "carol" });
  });

  it("falls back to the users array for legacy team events without hosts", async () => {
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue({ users: [buildUser()] });

    const users = await getUsersFromEvent(
      { id: 1, team: { slug: "team" }, owner: null, subsetOfHosts: [] } as never,
      prismaMock as never
    );

    expect(users?.[0]).toMatchObject({ username: "alice", organizationId: null });
  });

  it("returns an empty array for a legacy team event with no users at all", async () => {
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue({ users: [] });

    await expect(
      getUsersFromEvent(
        { id: 1, team: { slug: "team" }, owner: null, subsetOfHosts: [] } as never,
        prismaMock as never
      )
    ).resolves.toEqual([]);
  });

  it("returns null for a personal event without an owner", async () => {
    await expect(
      getUsersFromEvent({ id: 1, team: null, owner: null, subsetOfHosts: [] } as never, prismaMock as never)
    ).resolves.toBeNull();
  });

  it("returns the owner for a personal event", async () => {
    const users = await getUsersFromEvent(
      {
        id: 1,
        team: null,
        owner: buildUser({ profile: { organization: { id: 4, slug: "acme" } } }),
        subsetOfHosts: [],
      } as never,
      prismaMock as never
    );

    expect(users?.[0]).toMatchObject({ username: "alice", organizationId: 4 });
  });
});

describe("processEventDataShared", () => {
  it("returns the shared booker payload for a regular event", async () => {
    const result = await processEventDataShared({
      eventData: buildEvent() as never,
      metadata: {},
      prisma: prismaMock as never,
    });

    expect(result).toMatchObject({ isDynamic: false, showInstantEventConnectNowModal: false });
    expect(result.description).toContain("<strong>bold</strong>");
    expect(result.recurringEvent).toBeNull();
  });

  it("resolves instant availability when the event is instant", async () => {
    prismaMock.schedule.findUniqueOrThrow.mockResolvedValue({ availability: [] });

    const result = await processEventDataShared({
      eventData: buildEvent({
        isInstantEvent: true,
        instantMeetingSchedule: { id: 2, timeZone: "UTC" },
      }) as never,
      metadata: {},
      prisma: prismaMock as never,
    });

    expect(prismaMock.schedule.findUniqueOrThrow).toHaveBeenCalled();
    expect(result.showInstantEventConnectNowModal).toBe(false);
  });

  it("treats a missing isInstantEvent flag as false", async () => {
    const result = await processEventDataShared({
      eventData: buildEvent({ isInstantEvent: null }) as never,
      metadata: {},
      prisma: prismaMock as never,
    });

    expect(result.showInstantEventConnectNowModal).toBe(false);
    expect(prismaMock.schedule.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
