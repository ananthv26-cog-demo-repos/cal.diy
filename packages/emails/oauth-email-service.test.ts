import type { TFunction } from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendAdminOAuthClientNotification,
  sendOAuthClientApprovedNotification,
  sendOAuthClientRejectedNotification,
} from "./oauth-email-service";

const { emailMock, mockTemplate } = vi.hoisted(() => {
  const emailMock = {
    constructed: [] as { name: string; args: unknown[] }[],
    throwOnConstruct: null as string | null,
    throwOnSend: null as string | null,
  };

  const mockTemplate = (name: string) => () => ({
    default: class {
      constructor(...args: unknown[]) {
        if (emailMock.throwOnConstruct === name) throw new Error(`${name} failed to build`);
        emailMock.constructed.push({ name, args });
      }
      async sendEmail() {
        if (emailMock.throwOnSend === name) throw new Error(`${name} failed to send`);
        return `${name} sent`;
      }
    },
  });

  return { emailMock, mockTemplate };
});

vi.mock("./templates/admin-oauth-client-notification", mockTemplate("AdminOAuthClientNotification"));
vi.mock("./templates/oauth-client-approved-notification", mockTemplate("OAuthClientApprovedEmail"));
vi.mock("./templates/oauth-client-rejected-notification", mockTemplate("OAuthClientRejectedEmail"));

const t = ((key: string) => key) as TFunction;

const adminInput = {
  t,
  clientName: "My app",
  purpose: null,
  clientId: "client-1",
  redirectUri: "https://example.com/cb",
  submitterEmail: "owner@example.com",
  submitterName: "Owner",
};

const approvedInput = {
  t,
  userEmail: "owner@example.com",
  userName: "Owner",
  clientName: "My app",
  clientId: "client-1",
};

const rejectedInput = { ...approvedInput, rejectionReason: "Not allowed" };

describe("oauth-email-service", () => {
  beforeEach(() => {
    emailMock.constructed = [];
    emailMock.throwOnConstruct = null;
    emailMock.throwOnSend = null;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("sends the admin notification", async () => {
    await sendAdminOAuthClientNotification(adminInput);

    expect(emailMock.constructed).toEqual([{ name: "AdminOAuthClientNotification", args: [adminInput] }]);
  });

  it("sends the approved notification", async () => {
    await sendOAuthClientApprovedNotification(approvedInput);

    expect(emailMock.constructed).toEqual([{ name: "OAuthClientApprovedEmail", args: [approvedInput] }]);
  });

  it("sends the rejected notification", async () => {
    await sendOAuthClientRejectedNotification(rejectedInput);

    expect(emailMock.constructed).toEqual([{ name: "OAuthClientRejectedEmail", args: [rejectedInput] }]);
  });

  it("rethrows and logs when sending fails", async () => {
    emailMock.throwOnSend = "OAuthClientApprovedEmail";

    await expect(sendOAuthClientApprovedNotification(approvedInput)).rejects.toThrow(
      "OAuthClientApprovedEmail failed to send"
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("sendEmail oauth-email-service failed (Error)"),
      expect.any(Error)
    );
  });

  it("rethrows when the email cannot be built and reports an unknown constructor name", async () => {
    emailMock.throwOnConstruct = "AdminOAuthClientNotification";

    await expect(sendAdminOAuthClientNotification(adminInput)).rejects.toThrow(
      "AdminOAuthClientNotification failed to build"
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Email.sendEmail oauth-email-service failed (Error)"),
      expect.any(Error)
    );
  });
});
