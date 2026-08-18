import { WEBAPP_URL } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import type { WaitlistEmailProps } from "../src/templates/WaitlistEmail";
import BaseEmail from "./_base-email";

export type WaitlistEmailData = {
  uid: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeeTimeZone: string;
  eventTitle: string;
  startTime: Date;
  endTime: Date;
  offerExpiresAt?: Date | null;
  offerToken?: string;
  language: TFunction;
};

export abstract class WaitlistEmailBase extends BaseEmail {
  protected readonly data: WaitlistEmailData;

  constructor(data: WaitlistEmailData) {
    super();
    this.data = data;
  }

  protected getTimezone() {
    return this.data.attendeeTimeZone;
  }

  protected getLocale() {
    return "en";
  }

  protected getProps(): WaitlistEmailProps {
    const links = waitlistLinks(this.data);
    return {
      attendeeName: this.data.attendeeName,
      eventTitle: this.data.eventTitle,
      startTime: this.getFormattedRecipientTime({
        time: this.data.startTime.toISOString(),
        format: "MMM D, YYYY h:mm A",
      }),
      endTime: this.getFormattedRecipientTime({
        time: this.data.endTime.toISOString(),
        format: "MMM D, YYYY h:mm A",
      }),
      expiry: this.data.offerExpiresAt
        ? this.getFormattedRecipientTime({
            time: this.data.offerExpiresAt.toISOString(),
            format: "MMM D, YYYY h:mm A z",
          })
        : undefined,
      ...links,
      language: this.data.language,
    };
  }

  protected subject(key: string) {
    return this.data.language(key, { title: this.data.eventTitle });
  }
}

export function waitlistLinks(data: WaitlistEmailData) {
  const claimParams = new URLSearchParams({
    eventTitle: data.eventTitle,
    startTime: data.startTime.toISOString(),
    endTime: data.endTime.toISOString(),
    attendeeTimeZone: data.attendeeTimeZone,
    ...(data.offerExpiresAt ? { offerExpiresAt: data.offerExpiresAt.toISOString() } : {}),
  });

  return {
    claimLink: data.offerToken
      ? `${WEBAPP_URL}/waitlist/${encodeURIComponent(data.offerToken)}?${claimParams.toString()}`
      : undefined,
    leaveLink: `${WEBAPP_URL}/waitlist/leave?uid=${encodeURIComponent(data.uid)}`,
  };
}
