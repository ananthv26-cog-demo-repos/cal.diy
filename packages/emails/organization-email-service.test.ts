import type { TFunction } from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendAdminOrganizationNotification,
  sendOrganizationAdminNoSlotsNotification,
  sendOrganizationCreationEmail,
  sendOrganizationEmailVerification,
  sendTeamInviteEmail,
} from "./organization-email-service";
import type { TeamInvite } from "./templates/team-invite-email";

const { emailMock, mockTemplate } = vi.hoisted(() => {
  const emailMock = {
    constructed: [] as { name: string; args: unknown[] }[],
    throwOn: null as string | null,
  };

  const mockTemplate = (name: string) => () => ({
    default: class {
      constructor(...args: unknown[]) {
        if (emailMock.throwOn === name) throw new Error(`${name} failed to build`);
        emailMock.constructed.push({ name, args });
      }
      sendEmail() {
        return Promise.resolve();
      }
    },
  });

  return { emailMock, mockTemplate };
});

vi.mock("./templates/team-invite-email", mockTemplate("TeamInviteEmail"));
vi.mock("./templates/organization-creation-email", mockTemplate("OrganizationCreationEmail"));
vi.mock("./templates/organization-admin-no-slots-email", mockTemplate("OrganizationAdminNoSlotsEmail"));
vi.mock("./templates/organization-email-verification", mockTemplate("OrganizationEmailVerification"));
vi.mock("./templates/admin-organization-notification", mockTemplate("AdminOrganizationNotification"));

const language = ((key: string) => key) as TFunction;

const teamInvite: TeamInvite = {
  language,
  from: "Jane",
  to: "invitee@example.com",
  teamName: "Engineering",
  joinLink: "https://cal.example.com/join",
  isCalcomMember: true,
  isAutoJoin: false,
  isOrg: false,
  parentTeamName: undefined,
  isExistingUserMovedToOrg: false,
  prevLink: null,
  newLink: null,
};

describe("organization-email-service", () => {
  beforeEach(() => {
    emailMock.constructed = [];
    emailMock.throwOn = null;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("sends the team invite email", async () => {
    await sendTeamInviteEmail(teamInvite);

    expect(emailMock.constructed).toEqual([{ name: "TeamInviteEmail", args: [teamInvite] }]);
  });

  it("sends the organization creation email", async () => {
    const input = {
      language,
      from: "Jane",
      to: "owner@example.com",
      ownerNewUsername: "acme-owner",
      ownerOldUsername: "owner",
      orgDomain: "acme",
      orgName: "Acme",
      prevLink: "https://cal.example.com/owner",
      newLink: "https://acme.cal.example.com/acme-owner",
    };

    await sendOrganizationCreationEmail(input);

    expect(emailMock.constructed).toEqual([{ name: "OrganizationCreationEmail", args: [input] }]);
  });

  it("sends the organization admin no slots notification", async () => {
    const input = {
      language,
      to: { email: "admin@example.com" },
      user: "Jane",
      slug: "jane",
      startTime: "2024-01-01",
      endTime: "2024-01-07",
      editLink: "https://cal.example.com/edit",
      teamSlug: "engineering",
    };

    await sendOrganizationAdminNoSlotsNotification(input);

    expect(emailMock.constructed).toEqual([{ name: "OrganizationAdminNoSlotsEmail", args: [input] }]);
  });

  it("sends the organization email verification", async () => {
    const input = { language, user: { email: "owner@example.com" }, code: "123456" };

    await sendOrganizationEmailVerification(input);

    expect(emailMock.constructed).toEqual([{ name: "OrganizationEmailVerification", args: [input] }]);
  });

  it("sends the admin organization notification", async () => {
    const input = {
      t: language,
      instanceAdmins: [{ email: "admin@example.com" }],
      ownerEmail: "owner@example.com",
      orgSlug: "acme",
      webappIPAddress: "127.0.0.1",
    };

    await sendAdminOrganizationNotification(input);

    expect(emailMock.constructed).toEqual([{ name: "AdminOrganizationNotification", args: [input] }]);
  });

  it("rejects and logs when the email cannot be built", async () => {
    emailMock.throwOn = "TeamInviteEmail";

    await expect(sendTeamInviteEmail(teamInvite)).rejects.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("sendEmail failed"),
      expect.any(Error)
    );
  });
});
