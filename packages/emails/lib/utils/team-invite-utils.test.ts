import { APP_NAME } from "@calcom/lib/constants";
import { describe, expect, it, vi } from "vitest";
import type { TeamInvite } from "./team-invite-utils";
import { getSubject, getTypeOfInvite } from "./team-invite-utils";

const buildTeamInvite = (overrides: Partial<TeamInvite> = {}): TeamInvite =>
  ({
    language: vi.fn((key: string) => key) as unknown as TeamInvite["language"],
    from: "Alice",
    to: "bob@example.com",
    teamName: "Engineering",
    joinLink: "https://cal.com/join",
    isCalcomMember: false,
    isAutoJoin: false,
    isOrg: false,
    parentTeamName: undefined,
    isExistingUserMovedToOrg: false,
    prevLink: null,
    newLink: null,
    ...overrides,
  }) as TeamInvite;

describe("getTypeOfInvite", () => {
  it("returns TO_ORG for organization invites", () => {
    expect(getTypeOfInvite(buildTeamInvite({ isOrg: true }))).toBe("TO_ORG");
  });

  it("prefers TO_ORG over TO_SUBTEAM when both apply", () => {
    expect(getTypeOfInvite(buildTeamInvite({ isOrg: true, parentTeamName: "Acme" }))).toBe("TO_ORG");
  });

  it("returns TO_SUBTEAM when the team belongs to a parent team", () => {
    expect(getTypeOfInvite(buildTeamInvite({ parentTeamName: "Acme" }))).toBe("TO_SUBTEAM");
  });

  it("returns TO_REGULAR_TEAM for plain team invites", () => {
    expect(getTypeOfInvite(buildTeamInvite())).toBe("TO_REGULAR_TEAM");
  });

  it("throws when auto-join is requested for a regular team", () => {
    expect(() => getTypeOfInvite(buildTeamInvite({ isAutoJoin: true }))).toThrow(
      "Auto-join is not supported for regular teams"
    );
  });
});

describe("getSubject", () => {
  it("uses the org subject key and lowercased `organization` entity", () => {
    const language = vi.fn((key: string) => (key === "organization" ? "Organization" : key));
    const teamInviteEvent = buildTeamInvite({
      isOrg: true,
      language: language as unknown as TeamInvite["language"],
    });

    const subject = getSubject(teamInviteEvent);

    expect(subject).toBe("email_team_invite|subject|invited_to_org");
    expect(language).toHaveBeenCalledWith("email_team_invite|subject|invited_to_org", {
      user: "Alice",
      team: "Engineering",
      appName: APP_NAME,
      parentTeamName: undefined,
      entity: "organization",
    });
  });

  it("uses the `added` variant when the member is auto-joined", () => {
    const teamInviteEvent = buildTeamInvite({ isOrg: true, isAutoJoin: true });

    expect(getSubject(teamInviteEvent)).toBe("email_team_invite|subject|added_to_org");
  });

  it("uses the subteam subject key and passes the parent team name", () => {
    const language = vi.fn((key: string) => (key === "team" ? "Team" : key));
    const teamInviteEvent = buildTeamInvite({
      parentTeamName: "Acme",
      language: language as unknown as TeamInvite["language"],
    });

    expect(getSubject(teamInviteEvent)).toBe("email_team_invite|subject|invited_to_subteam");
    expect(language).toHaveBeenCalledWith(
      "email_team_invite|subject|invited_to_subteam",
      expect.objectContaining({ parentTeamName: "Acme", entity: "team" })
    );
  });

  it("uses the regular team subject key", () => {
    expect(getSubject(buildTeamInvite())).toBe("email_team_invite|subject|invited_to_regular_team");
  });

  it("uses the `added` variant for auto-joined subteam invites", () => {
    expect(getSubject(buildTeamInvite({ parentTeamName: "Acme", isAutoJoin: true }))).toBe(
      "email_team_invite|subject|added_to_subteam"
    );
  });
});
