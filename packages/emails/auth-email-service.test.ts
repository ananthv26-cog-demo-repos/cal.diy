import type { TFunction } from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendChangeOfEmailVerificationLink,
  sendEmailVerificationCode,
  sendEmailVerificationLink,
  sendPasswordResetEmail,
} from "./auth-email-service";

const { emailMock, mockTemplate } = vi.hoisted(() => {
  const emailMock = {
    constructed: [] as { name: string; args: unknown[] }[],
    sent: [] as string[],
    throwOn: null as string | null,
  };

  const mockTemplate = (name: string) => () => ({
    default: class {
      constructor(...args: unknown[]) {
        if (emailMock.throwOn === name) throw new Error(`${name} failed to build`);
        emailMock.constructed.push({ name, args });
      }
      sendEmail() {
        emailMock.sent.push(name);
        return Promise.resolve();
      }
    },
  });

  return { emailMock, mockTemplate };
});

vi.mock("./templates/forgot-password-email", mockTemplate("ForgotPasswordEmail"));
vi.mock("./templates/account-verify-email", mockTemplate("AccountVerifyEmail"));
vi.mock("./templates/attendee-verify-email", mockTemplate("AttendeeVerifyEmail"));
vi.mock("./templates/change-account-email-verify", mockTemplate("ChangeOfEmailVerifyEmail"));

const language = ((key: string) => key) as TFunction;

describe("auth-email-service", () => {
  beforeEach(() => {
    emailMock.constructed = [];
    emailMock.sent = [];
    emailMock.throwOn = null;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("sends a password reset email with the given payload", async () => {
    const payload = {
      language,
      user: { name: "Jane", email: "jane@example.com" },
      resetLink: "https://cal.example.com/reset",
    };

    await sendPasswordResetEmail(payload);

    expect(emailMock.constructed).toEqual([{ name: "ForgotPasswordEmail", args: [payload] }]);
    expect(emailMock.sent).toEqual(["ForgotPasswordEmail"]);
  });

  it("sends an email verification link", async () => {
    const payload = {
      language,
      user: { email: "jane@example.com" },
      verificationEmailLink: "https://cal.example.com/verify",
    };

    await sendEmailVerificationLink(payload);

    expect(emailMock.constructed).toEqual([{ name: "AccountVerifyEmail", args: [payload] }]);
  });

  it("sends an email verification code", async () => {
    const payload = { language, user: { email: "jane@example.com" }, verificationEmailCode: "123456" };

    await sendEmailVerificationCode(payload);

    expect(emailMock.constructed).toEqual([{ name: "AttendeeVerifyEmail", args: [payload] }]);
  });

  it("sends a change of email verification link", async () => {
    const payload = {
      language,
      user: { emailFrom: "a@example.com", emailTo: "b@example.com" },
      verificationEmailLink: "https://cal.example.com/verify",
    };

    await sendChangeOfEmailVerificationLink(payload);

    expect(emailMock.constructed).toEqual([{ name: "ChangeOfEmailVerifyEmail", args: [payload] }]);
  });

  it("rejects and logs when building the email throws", async () => {
    emailMock.throwOn = "ForgotPasswordEmail";

    await expect(
      sendPasswordResetEmail({ language, user: { email: "jane@example.com" }, resetLink: "link" })
    ).rejects.toBeUndefined();

    expect(console.error).toHaveBeenCalled();
    expect(emailMock.sent).toEqual([]);
  });
});
