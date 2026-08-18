import { getTranslation } from "@calcom/i18n/server";
import { describe, expect, it } from "vitest";
import { WaitlistEmailBase, type WaitlistEmailData } from "./waitlist-email-base";

class TestWaitlistEmail extends WaitlistEmailBase {
  constructor(data: WaitlistEmailData) {
    super(data);
  }

  props() {
    return this.getProps();
  }
}

describe("waitlist offer email", () => {
  it("renders expiry in the attendee timezone across DST", async () => {
    const language = await getTranslation("en", "common");
    const email = new TestWaitlistEmail({
      uid: "waitlist-1",
      attendeeName: "Attendee",
      attendeeEmail: "attendee@example.com",
      attendeeTimeZone: "Pacific/Auckland",
      eventTitle: "Consultation",
      startTime: new Date("2025-09-27T20:00:00.000Z"),
      endTime: new Date("2025-09-27T21:00:00.000Z"),
      offerExpiresAt: new Date("2025-09-27T20:30:00.000Z"),
      offerToken: "token-only-in-link",
      language,
    });

    const props = email.props();
    expect(props.expiry).toContain("Sep 28, 2025");
    expect(props.expiry).toContain("9:30 AM");
    expect(props.claimLink).toContain("token-only-in-link");
    expect(props.claimLink).not.toContain("?");
    expect(props.attendeeName).not.toContain("token-only-in-link");
  });
});
