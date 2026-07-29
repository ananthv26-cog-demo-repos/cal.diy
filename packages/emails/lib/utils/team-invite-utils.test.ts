import { APP_NAME } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import type { TeamInvite } from "./team-invite-utils";
import { getSubject, getTypeOfInvite } from "./team-invite-utils";

// A translate mock that echoes the key plus a serialized copy of the interpolation
// variables, so we can assert both which key was chosen and which variables were passed.
const translate = ((key: string, vars?: Record<string, unknown>) => {
  if (vars) return `${key}|${JSON.stringify(vars)}`;
  return key;
}) as unknown as TFunction;

const buildTeamInvite = (overrides: Partial<TeamInvite> = {}): TeamInvite => ({
  language: translate,
  from: "Alice",
  to: "bob@example.com",
  teamName: "Engineering",
  joinLink: "https://cal.com/join",
  isCalcomMember: true,
  isAutoJoin: false,
  isOrg: false,
  parentTeamName: undefined,
  isExistingUserMovedToOrg: false,
  prevLink: null,
  newLink: null,
  ...overrides,
});

describe("getTypeOfInvite", () => {
  it("returns TO_ORG when the invite targets an organization", () => {
    expect(getTypeOfInvite(buildTeamInvite({ isOrg: true }))).toBe("TO_ORG");
  });

  it("prioritizes TO_ORG over a set parentTeamName", () => {
    expect(getTypeOfInvite(buildTeamInvite({ isOrg: true, parentTeamName: "Parent" }))).toBe("TO_ORG");
  });

  it("returns TO_SUBTEAM when there is a parent team and it is not an org", () => {
    expect(getTypeOfInvite(buildTeamInvite({ parentTeamName: "Parent" }))).toBe("TO_SUBTEAM");
  });

  it("returns TO_REGULAR_TEAM for a plain team invite", () => {
    expect(getTypeOfInvite(buildTeamInvite())).toBe("TO_REGULAR_TEAM");
  });

  it("throws when auto-join is requested for a regular team", () => {
    expect(() => getTypeOfInvite(buildTeamInvite({ isAutoJoin: true }))).toThrow(
      "Auto-join is not supported for regular teams"
    );
  });

  it("does not throw for auto-join into an org (org check comes first)", () => {
    expect(getTypeOfInvite(buildTeamInvite({ isAutoJoin: true, isOrg: true }))).toBe("TO_ORG");
  });
});

describe("getSubject", () => {
  it("uses the invited_to_org key with correct variables for a normal org invite", () => {
    const subject = getSubject(buildTeamInvite({ isOrg: true }));
    expect(subject).toContain("email_team_invite|subject|invited_to_org");
    expect(subject).toContain('"user":"Alice"');
    expect(subject).toContain('"team":"Engineering"');
    expect(subject).toContain(`"appName":"${APP_NAME}"`);
    expect(subject).toContain('"entity":"organization"');
  });

  it("uses the added_to_org key when the org invite is an auto-join", () => {
    const subject = getSubject(buildTeamInvite({ isOrg: true, isAutoJoin: true }));
    expect(subject).toContain("email_team_invite|subject|added_to_org");
  });

  it("uses the invited_to_subteam key and passes the parent team name", () => {
    const subject = getSubject(buildTeamInvite({ parentTeamName: "Parent" }));
    expect(subject).toContain("email_team_invite|subject|invited_to_subteam");
    expect(subject).toContain('"parentTeamName":"Parent"');
    expect(subject).toContain('"entity":"team"');
  });

  it("uses the invited_to_regular_team key for a plain team invite", () => {
    const subject = getSubject(buildTeamInvite());
    expect(subject).toContain("email_team_invite|subject|invited_to_regular_team");
  });
});
