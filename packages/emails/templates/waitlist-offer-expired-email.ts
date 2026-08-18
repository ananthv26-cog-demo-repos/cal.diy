import renderEmail from "../src/renderEmail";
import { WaitlistEmailBase, type WaitlistEmailData } from "./waitlist-email-base";

export default class WaitlistOfferExpiredEmail extends WaitlistEmailBase {
  constructor(data: WaitlistEmailData) {
    super(data);
    this.name = "WAITLIST_OFFER_EXPIRED";
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const props = this.getProps();
    return {
      to: this.data.attendeeEmail,
      subject: this.data.language("waitlist_offer_expired_subject", { title: this.data.eventTitle }),
      html: await renderEmail("WaitlistOfferExpiredEmail", props),
      text: this.data.language("waitlist_offer_expired_body", {
        title: this.data.eventTitle,
        start: props.startTime,
      }),
    };
  }
}
