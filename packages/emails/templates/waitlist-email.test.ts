import { getTranslation } from "@calcom/i18n/server";
import { describe, expect, it } from "vitest";
import WaitlistCancelledEmail from "./waitlist-cancelled-email";
import { WaitlistEmailBase, type WaitlistEmailData } from "./waitlist-email-base";
import WaitlistJoinedEmail from "./waitlist-joined-email";
import WaitlistOfferEmail from "./waitlist-offer-email";
import WaitlistOfferExpiredEmail from "./waitlist-offer-expired-email";

const createData = async (): Promise<WaitlistEmailData> => ({
  uid: "waitlist-1",
  attendeeName: "Attendee",
  attendeeEmail: "attendee@example.com",
  attendeeTimeZone: "Pacific/Auckland",
  eventTitle: "Consultation",
  startTime: new Date("2025-09-27T20:00:00.000Z"),
  endTime: new Date("2025-09-27T21:00:00.000Z"),
  offerExpiresAt: new Date("2025-09-27T20:30:00.000Z"),
  offerToken: "token-only-in-link",
  language: await getTranslation("en", "common"),
});

class TestWaitlistEmail extends WaitlistEmailBase {
  constructor(data: WaitlistEmailData) {
    super(data);
  }

  props() {
    return this.getProps();
  }
}

class TestWaitlistOfferEmail extends WaitlistOfferEmail {
  async payload() {
    return await this.getNodeMailerPayload();
  }

  props() {
    return this.getProps();
  }
}

class TestWaitlistJoinedEmail extends WaitlistJoinedEmail {
  async payload() {
    return await this.getNodeMailerPayload();
  }
}

class TestWaitlistOfferExpiredEmail extends WaitlistOfferExpiredEmail {
  async payload() {
    return await this.getNodeMailerPayload();
  }
}

class TestWaitlistCancelledEmail extends WaitlistCancelledEmail {
  async payload() {
    return await this.getNodeMailerPayload();
  }
}

describe("waitlist emails", () => {
  it("sets a sender on every waitlist email", async () => {
    const data = await createData();
    const payloads = await Promise.all([
      new TestWaitlistJoinedEmail(data).payload(),
      new TestWaitlistOfferEmail(data).payload(),
      new TestWaitlistOfferExpiredEmail(data).payload(),
      new TestWaitlistCancelledEmail(data).payload(),
    ]);

    for (const payload of payloads) {
      expect(payload.from).toBeTruthy();
    }
  });

  it("includes offer actions in the plaintext payload", async () => {
    const data = await createData();
    const email = new TestWaitlistOfferEmail(data);
    const props = email.props();
    const payload = await email.payload();
    const text = String(payload.text);

    expect(text).toContain(props.claimLink);
    expect(text).toContain(props.leaveLink);
    expect(text).toContain(props.expiry);
  });

  it("renders the expiry and start time with the attendee timezone", async () => {
    const data = await createData();
    const email = new TestWaitlistEmail(data);
    const props = email.props();

    expect(props.expiry).toContain("Sep 28, 2025");
    expect(props.expiry).toContain("9:30 AM");
    expect(props.expiry).toContain("Pacific/Auckland");
    expect(props.expiry).not.toContain(" z");
    expect(props.startTime).toContain("Pacific/Auckland");
    expect(props.claimLink).toContain("token-only-in-link");
    expect(props.attendeeName).not.toContain("token-only-in-link");
  });

  it("only renders the claim CTA for offer emails", async () => {
    const data = await createData();
    const offerHtml = String(
      await new TestWaitlistOfferEmail(data).payload().then((payload) => payload.html)
    );
    const expiredHtml = String(
      await new TestWaitlistOfferExpiredEmail(data).payload().then((payload) => payload.html)
    );
    const cancelledHtml = String(
      await new TestWaitlistCancelledEmail(data).payload().then((payload) => payload.html)
    );

    expect(offerHtml).toContain(data.offerToken);
    expect(expiredHtml).not.toContain(data.offerToken);
    expect(cancelledHtml).not.toContain(data.offerToken);
  });
});
