import { BookerLayouts } from "@calcom/prisma/zod-utils";
import { describe, expect, it, vi } from "vitest";
import { getProfileFromEvent, getPublicEventSelect, getUsersFromEvent } from "./getPublicEvent";

vi.mock("@calcom/prisma", () => ({
  PrismaClient: vi.fn(),
}));

type ProfileEvent = Parameters<typeof getProfileFromEvent>[0];
type UsersEvent = Parameters<typeof getUsersFromEvent>[0];
type UsersEventPrisma = Parameters<typeof getUsersFromEvent>[1];

const buildUser = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  username: "alice",
  name: "Alice",
  weekStart: "Sunday",
  avatarUrl: "https://example.com/alice.png",
  brandColor: "#user-brand",
  darkBrandColor: "#user-dark",
  theme: "light",
  metadata: null,
  organization: null,
  defaultScheduleId: null,
  ...overrides,
});

const buildTeam = (overrides: Record<string, unknown> = {}) => ({
  parentId: null,
  metadata: null,
  brandColor: "#team-brand",
  darkBrandColor: "#team-dark",
  slug: "team-slug",
  name: "Team",
  logoUrl: "https://example.com/team.png",
  theme: "dark",
  hideTeamProfileLink: false,
  parent: null,
  isPrivate: false,
  organizationSettings: null,
  ...overrides,
});

const buildProfileEvent = (overrides: Record<string, unknown> = {}): ProfileEvent =>
  ({
    metadata: {},
    team: null,
    owner: null,
    parent: null,
    subsetOfHosts: [],
    ...overrides,
  }) as unknown as ProfileEvent;

describe("getPublicEventSelect", () => {
  it("limits the number of fetched hosts when fetchAllUsers is false", () => {
    expect(getPublicEventSelect(false).hosts).toMatchObject({ take: 3 });
  });

  it("does not limit hosts when fetchAllUsers is true", () => {
    expect(getPublicEventSelect(true).hosts).not.toHaveProperty("take");
  });
});

describe("getProfileFromEvent", () => {
  it("throws when the event has neither team, host nor owner", () => {
    expect(() => getProfileFromEvent(buildProfileEvent())).toThrow("Event has no owner");
  });

  it("uses the owner profile for personal events", () => {
    const profile = getProfileFromEvent(buildProfileEvent({ owner: buildUser() }));

    expect(profile.username).toBe("alice");
    expect(profile.name).toBe("Alice");
    expect(profile.weekStart).toBe("Sunday");
    expect(profile.brandColor).toBe("#user-brand");
    expect(profile.darkBrandColor).toBe("#user-dark");
    expect(profile.theme).toBe("light");
    expect(profile.image).toBe("https://example.com/alice.png");
  });

  it("prefers the first host over the owner as the non-team profile", () => {
    const profile = getProfileFromEvent(
      buildProfileEvent({
        owner: buildUser(),
        subsetOfHosts: [{ user: buildUser({ username: "bob", name: "Bob", weekStart: "Tuesday" }) }],
      })
    );

    expect(profile.username).toBe("bob");
    expect(profile.name).toBe("Bob");
    expect(profile.weekStart).toBe("Tuesday");
  });

  it("falls back to Monday when neither host nor owner define a weekStart", () => {
    const profile = getProfileFromEvent(buildProfileEvent({ owner: buildUser({ weekStart: null }) }));

    expect(profile.weekStart).toBe("Monday");
  });

  it("uses the team as the profile and the team slug as username for team events", () => {
    const profile = getProfileFromEvent(buildProfileEvent({ team: buildTeam() }));

    expect(profile.username).toBe("team-slug");
    expect(profile.name).toBe("Team");
    expect(profile.brandColor).toBe("#team-brand");
    expect(profile.image).toBe("https://example.com/team.png");
  });

  it("takes styling from the parent team for managed child events", () => {
    const profile = getProfileFromEvent(
      buildProfileEvent({
        owner: buildUser(),
        parent: { team: { brandColor: "#parent-brand", darkBrandColor: "#parent-dark", theme: "dark" } },
      })
    );

    expect(profile.username).toBe("alice");
    expect(profile.brandColor).toBe("#parent-brand");
    expect(profile.darkBrandColor).toBe("#parent-dark");
    expect(profile.theme).toBe("dark");
  });

  it("prefers the event booker layouts over the user default layouts", () => {
    const profile = getProfileFromEvent(
      buildProfileEvent({
        metadata: { bookerLayouts: { defaultLayout: BookerLayouts.COLUMN_VIEW, enabledLayouts: [] } },
        owner: buildUser({
          metadata: {
            defaultBookerLayouts: { defaultLayout: BookerLayouts.WEEK_VIEW, enabledLayouts: [] },
          },
        }),
      })
    );

    expect(profile.bookerLayouts?.defaultLayout).toBe(BookerLayouts.COLUMN_VIEW);
  });

  it("falls back to the user default booker layouts", () => {
    const profile = getProfileFromEvent(
      buildProfileEvent({
        owner: buildUser({
          metadata: {
            defaultBookerLayouts: { defaultLayout: BookerLayouts.WEEK_VIEW, enabledLayouts: [] },
          },
        }),
      })
    );

    expect(profile.bookerLayouts?.defaultLayout).toBe(BookerLayouts.WEEK_VIEW);
  });

  it("returns null booker layouts when neither event nor user define them", () => {
    expect(getProfileFromEvent(buildProfileEvent({ owner: buildUser() })).bookerLayouts).toBeNull();
  });
});

describe("getUsersFromEvent", () => {
  const personalProfile = {
    id: null,
    upId: "usr-1",
    username: "alice",
    organizationId: null,
    organization: null,
  };

  const buildUsersEvent = (overrides: Record<string, unknown> = {}): UsersEvent =>
    ({
      id: 99,
      team: null,
      owner: null,
      hosts: undefined,
      subsetOfHosts: [],
      ...overrides,
    }) as unknown as UsersEvent;

  const noopPrisma = {} as unknown as UsersEventPrisma;

  it("returns null for a personal event without an owner", async () => {
    expect(await getUsersFromEvent(buildUsersEvent(), noopPrisma)).toBeNull();
  });

  it("returns the owner with a booker url for a personal event", async () => {
    const users = await getUsersFromEvent(
      buildUsersEvent({ owner: { ...buildUser(), profile: personalProfile } }),
      noopPrisma
    );

    expect(users).toHaveLength(1);
    expect(users?.[0]).toMatchObject({
      username: "alice",
      name: "Alice",
      weekStart: "Sunday",
      organizationId: null,
      avatarUrl: "https://example.com/alice.png",
    });
    expect(users?.[0].bookerUrl).toBeTruthy();
  });

  it("exposes the owner organization id when the owner belongs to an org", async () => {
    const users = await getUsersFromEvent(
      buildUsersEvent({
        owner: {
          ...buildUser(),
          profile: { ...personalProfile, organizationId: 5, organization: { id: 5, slug: "acme" } },
        },
      }),
      noopPrisma
    );

    expect(users?.[0].organizationId).toBe(5);
  });

  it("maps team hosts to users and prefers hosts over subsetOfHosts", async () => {
    const users = await getUsersFromEvent(
      buildUsersEvent({
        team: buildTeam(),
        hosts: [{ user: { ...buildUser({ username: "bob", name: "Bob" }), profile: personalProfile } }],
        subsetOfHosts: [
          { user: { ...buildUser({ username: "carol", name: "Carol" }), profile: personalProfile } },
        ],
      }),
      noopPrisma
    );

    expect(users?.map((user) => user.username)).toEqual(["bob"]);
  });

  it("falls back to subsetOfHosts when hosts is empty", async () => {
    const users = await getUsersFromEvent(
      buildUsersEvent({
        team: buildTeam(),
        hosts: [],
        subsetOfHosts: [
          { user: { ...buildUser({ username: "carol", name: "Carol" }), profile: personalProfile } },
        ],
      }),
      noopPrisma
    );

    expect(users?.map((user) => user.username)).toEqual(["carol"]);
  });

  it("filters out team hosts without a username", async () => {
    const users = await getUsersFromEvent(
      buildUsersEvent({
        team: buildTeam(),
        subsetOfHosts: [
          { user: { ...buildUser({ username: null }), profile: personalProfile } },
          { user: { ...buildUser({ username: "bob" }), profile: personalProfile } },
        ],
      }),
      noopPrisma
    );

    expect(users?.map((user) => user.username)).toEqual(["bob"]);
  });

  it("falls back to the legacy users array when a team event has no hosts", async () => {
    const findUniqueOrThrow = vi.fn().mockResolvedValue({ users: [] });

    const users = await getUsersFromEvent(buildUsersEvent({ team: buildTeam() }), {
      eventType: { findUniqueOrThrow },
    } as unknown as UsersEventPrisma);

    expect(findUniqueOrThrow).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 99 } }));
    expect(users).toEqual([]);
  });
});
