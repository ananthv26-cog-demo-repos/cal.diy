import { MembershipRole, SchedulingType } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  enrichUsersWithTheirProfiles,
  findAllByUpId,
  findAllByUpIdIncludeTeamWithMembersAndEventTypes,
  findByUpIdWithAuth,
} = vi.hoisted(() => ({
  enrichUsersWithTheirProfiles: vi.fn(),
  findAllByUpId: vi.fn(),
  findAllByUpIdIncludeTeamWithMembersAndEventTypes: vi.fn(),
  findByUpIdWithAuth: vi.fn(),
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: class {
    enrichUsersWithTheirProfiles = enrichUsersWithTheirProfiles;
  },
}));

vi.mock("@calcom/features/eventtypes/repositories/eventTypeRepository", () => ({
  EventTypeRepository: class {
    findAllByUpId = findAllByUpId;
  },
}));

vi.mock("@calcom/features/membership/repositories/MembershipRepository", () => ({
  MembershipRepository: { findAllByUpIdIncludeTeamWithMembersAndEventTypes },
}));

vi.mock("@calcom/features/profile/repositories/ProfileRepository", () => ({
  ProfileRepository: { findByUpIdWithAuth },
}));

vi.mock("@calcom/prisma", () => ({ default: {}, prisma: {} }));

import { compareMembership, getEventTypesByViewer } from "./getEventTypesByViewer";

const viewer = { id: 1, profile: { upId: "usr-1" } };

function buildProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    username: "alice",
    name: "Alice",
    avatarUrl: null,
    organizationId: null,
    organization: null,
    ...overrides,
  };
}

function buildEventType(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    title: "30 min",
    slug: "30min",
    position: 0,
    teamId: null,
    userId: 1,
    parentId: null,
    schedulingType: null,
    description: null,
    metadata: null,
    users: [{ id: 1, username: "alice" }],
    hosts: [],
    children: [],
    ...overrides,
  };
}

function buildMembership(overrides: Record<string, unknown> = {}) {
  const { team, ...rest } = overrides as { team?: Record<string, unknown> };
  return {
    role: MembershipRole.OWNER,
    accepted: true,
    team: {
      id: 2,
      name: "Team",
      slug: "team",
      logoUrl: null,
      metadata: null,
      parentId: null,
      parent: null,
      isOrganization: false,
      members: [{ id: 1 }],
      eventTypes: [],
      ...team,
    },
    ...rest,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  enrichUsersWithTheirProfiles.mockImplementation(async (users: { id: number }[]) =>
    users.map((user) => ({ ...user, profile: { id: 100 } }))
  );
  findByUpIdWithAuth.mockResolvedValue(buildProfile());
  findAllByUpId.mockResolvedValue([]);
  findAllByUpIdIncludeTeamWithMembersAndEventTypes.mockResolvedValue([]);
});

describe("compareMembership", () => {
  it("ranks higher roles above lower ones", () => {
    expect(compareMembership(MembershipRole.OWNER, MembershipRole.MEMBER)).toBe(true);
    expect(compareMembership(MembershipRole.MEMBER, MembershipRole.OWNER)).toBe(false);
    expect(compareMembership(MembershipRole.ADMIN, MembershipRole.ADMIN)).toBe(false);
  });
});

describe("getEventTypesByViewer", () => {
  it("throws when the viewer has no profile", async () => {
    findByUpIdWithAuth.mockResolvedValue(null);

    await expect(getEventTypesByViewer(viewer)).rejects.toThrow("Profile not found");
  });

  it("returns a personal group with the viewer's event types ordered by position", async () => {
    findAllByUpId.mockResolvedValue([
      buildEventType({ id: 11, position: 1 }),
      buildEventType({ id: 12, position: 5 }),
    ]);

    const result = await getEventTypesByViewer(viewer);

    expect(findAllByUpId).toHaveBeenCalledWith(
      { upId: "usr-1", userId: 1 },
      expect.objectContaining({ where: { teamId: null } })
    );
    expect(result.eventTypeGroups).toHaveLength(1);
    expect(result.eventTypeGroups[0].eventTypes.map((evType) => evType.id)).toEqual([12, 11]);
    expect(result.eventTypeGroups[0].profile).toMatchObject({ slug: "alice", name: "Alice" });
    expect(result.profiles[0]).toMatchObject({ membershipCount: 1, readOnly: false, teamId: null });
  });

  it("moves the users out of each event type and into a shared map", async () => {
    findAllByUpId.mockResolvedValue([buildEventType({ users: [{ id: 3, username: "carol" }] })]);

    const result = await getEventTypesByViewer(viewer);

    const [eventType] = result.eventTypeGroups[0].eventTypes;
    expect(eventType).not.toHaveProperty("users");
    expect(eventType.userIds).toEqual([3]);
    expect(result.allUsersAcrossAllEventTypes.get(3)).toMatchObject({ username: "carol" });
  });

  it("prefers hosts over the legacy users relation and renders the description", async () => {
    findAllByUpId.mockResolvedValue([
      buildEventType({
        description: "**bold**",
        hosts: [{ user: { id: 4, username: "dave" } }],
        users: [{ id: 1, username: "alice" }],
      }),
    ]);

    const result = await getEventTypesByViewer(viewer);

    expect(result.eventTypeGroups[0].eventTypes[0].userIds).toEqual([4]);
    expect(result.eventTypeGroups[0].eventTypes[0].safeDescription).toContain("<strong>bold</strong>");
  });

  it("parses metadata and keeps it null when absent", async () => {
    findAllByUpId.mockResolvedValue([
      buildEventType({ id: 11, metadata: { multipleDuration: [15] } }),
      buildEventType({ id: 12 }),
    ]);

    const result = await getEventTypesByViewer(viewer);
    const byId = new Map(result.eventTypeGroups[0].eventTypes.map((evType) => [evType.id, evType]));

    expect(byId.get(11)?.metadata).toMatchObject({ multipleDuration: [15] });
    expect(byId.get(12)?.metadata).toBeNull();
  });

  it("enriches the children of a managed event type", async () => {
    findAllByUpId.mockResolvedValue([
      buildEventType({
        schedulingType: SchedulingType.COLLECTIVE,
        children: [{ id: 20, users: [{ id: 5, username: "erin" }] }],
      }),
    ]);

    const result = await getEventTypesByViewer(viewer);

    expect(result.eventTypeGroups[0].eventTypes[0].children[0].users[0]).toMatchObject({
      id: 5,
      profile: { id: 100 },
    });
  });

  it("keeps child event types only when the viewer is their assignee", async () => {
    findAllByUpId.mockResolvedValue([
      buildEventType({ id: 11, parentId: 9, users: [{ id: 1, username: "alice" }] }),
      buildEventType({ id: 12, parentId: 9, users: [{ id: 2, username: "bob" }] }),
      buildEventType({ id: 13, parentId: 9, users: [] }),
    ]);

    const result = await getEventTypesByViewer(viewer);

    expect(result.eventTypeGroups[0].eventTypes.map((evType) => evType.id)).toEqual([11]);
  });

  it("excludes managed event types from the personal group", async () => {
    findAllByUpId.mockResolvedValue([
      buildEventType({ id: 11, schedulingType: SchedulingType.MANAGED }),
      buildEventType({ id: 12 }),
    ]);

    const result = await getEventTypesByViewer(viewer);

    expect(result.eventTypeGroups[0].eventTypes.map((evType) => evType.id)).toEqual([12]);
  });

  it("marks personal event types as locked when the organization locks creation", async () => {
    findByUpIdWithAuth.mockResolvedValue(
      buildProfile({
        organizationId: 3,
        organization: { organizationSettings: { lockEventTypeCreationForUsers: true } },
      })
    );

    const result = await getEventTypesByViewer(viewer);

    expect(result.eventTypeGroups[0].profile.eventTypesLockedByOrg).toBe(true);
  });

  it("adds a group per accepted team membership and skips organizations", async () => {
    findAllByUpIdIncludeTeamWithMembersAndEventTypes.mockResolvedValue([
      buildMembership(),
      buildMembership({ team: { id: 3, name: "Org", slug: "org", isOrganization: true } }),
    ]);

    const result = await getEventTypesByViewer(viewer);

    expect(findAllByUpIdIncludeTeamWithMembersAndEventTypes).toHaveBeenCalledWith(
      { upId: "usr-1" },
      { where: { accepted: true } }
    );
    expect(result.eventTypeGroups).toHaveLength(2);
    expect(result.eventTypeGroups[1]).toMatchObject({ teamId: 2, membershipRole: MembershipRole.OWNER });
    expect(result.eventTypeGroups[1].profile.slug).toBe("team/team");
  });

  it("uses the bare slug for teams inside an organization", async () => {
    findAllByUpIdIncludeTeamWithMembersAndEventTypes.mockResolvedValue([
      buildMembership({
        team: { parentId: 9, parent: { slug: "acme", name: "Acme", logoUrl: null, metadata: null } },
      }),
    ]);

    const result = await getEventTypesByViewer(viewer);

    expect(result.eventTypeGroups[1].profile.slug).toBe("team");
  });

  it("uses a null slug for teams that have not claimed one", async () => {
    findAllByUpIdIncludeTeamWithMembersAndEventTypes.mockResolvedValue([
      buildMembership({ team: { slug: null, metadata: { requestedSlug: "pending" } } }),
    ]);

    const result = await getEventTypesByViewer(viewer);

    expect(result.eventTypeGroups[1].profile.slug).toBeNull();
  });

  it("promotes the organization role over a weaker team role", async () => {
    findAllByUpIdIncludeTeamWithMembersAndEventTypes.mockResolvedValue([
      buildMembership({ role: MembershipRole.OWNER, team: { id: 9, isOrganization: true } }),
      buildMembership({ role: MembershipRole.MEMBER, team: { id: 2, parentId: 9 } }),
    ]);

    const result = await getEventTypesByViewer(viewer);

    expect(result.eventTypeGroups[1].membershipRole).toBe(MembershipRole.OWNER);
  });

  it("marks team event types read only and hides managed events without update permission", async () => {
    findAllByUpIdIncludeTeamWithMembersAndEventTypes.mockResolvedValue([
      buildMembership({
        team: {
          eventTypes: [
            buildEventType({ id: 21, teamId: 2, userId: null }),
            buildEventType({ id: 22, teamId: 2, userId: null, schedulingType: SchedulingType.MANAGED }),
            buildEventType({ id: 23, teamId: 2, userId: 99 }),
          ],
        },
      }),
    ]);

    const result = await getEventTypesByViewer(viewer);

    expect(result.eventTypeGroups[1].metadata.readOnly).toBe(true);
    expect(result.eventTypeGroups[1].eventTypes.map((evType) => evType.id)).toEqual([21]);
  });

  it("filters teams and event types by the requested team ids", async () => {
    findAllByUpIdIncludeTeamWithMembersAndEventTypes.mockResolvedValue([
      buildMembership({ team: { id: 2, eventTypes: [buildEventType({ id: 21, teamId: 2, userId: null })] } }),
      buildMembership({ team: { id: 3, slug: "other" } }),
    ]);

    const result = await getEventTypesByViewer(viewer, { teamIds: [2] });

    expect(result.eventTypeGroups.map((group) => group.teamId)).toEqual([2]);
    expect(result.eventTypeGroups[0].eventTypes.map((evType) => evType.id)).toEqual([21]);
  });

  it("filters team event types by scheduling type", async () => {
    findAllByUpIdIncludeTeamWithMembersAndEventTypes.mockResolvedValue([
      buildMembership({
        team: {
          eventTypes: [
            buildEventType({
              id: 21,
              teamId: 2,
              userId: null,
              schedulingType: SchedulingType.ROUND_ROBIN,
            }),
            buildEventType({
              id: 22,
              teamId: 2,
              userId: null,
              schedulingType: SchedulingType.COLLECTIVE,
            }),
            buildEventType({ id: 23, teamId: 2, userId: null }),
          ],
        },
      }),
    ]);

    const result = await getEventTypesByViewer(viewer, {
      teamIds: [2],
      schedulingTypes: [SchedulingType.ROUND_ROBIN],
    });

    expect(result.eventTypeGroups[0].eventTypes.map((evType) => evType.id)).toEqual([21]);
  });

  it("skips the viewer's own event types when only other profiles are filtered", async () => {
    const result = await getEventTypesByViewer(viewer, { upIds: ["usr-2"] });

    expect(findAllByUpId).toHaveBeenCalled();
    expect(result.eventTypeGroups[0].teamId).toBeNull();
  });

  it("does not load personal event types when only teams are filtered", async () => {
    await getEventTypesByViewer(viewer, { teamIds: [2] });

    expect(findAllByUpId).not.toHaveBeenCalled();
  });
});
