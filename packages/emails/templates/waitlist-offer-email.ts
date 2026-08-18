import renderEmail from "../src/renderEmail";
import { WaitlistEmailBase, type WaitlistEmailData } from "./waitlist-email-base";

export default class WaitlistOfferEmail extends WaitlistEmailBase {
  constructor(data: WaitlistEmailData) {
    super(data);
    this.name = "WAITLIST_OFFER";
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const props = this.getProps();
    return {
      to: this.data.attendeeEmail,
      subject: this.data.language("waitlist_offer_subject", { title: this.data.eventTitle }),
      html: await renderEmail("WaitlistOfferEmail", props),
      text: this.data.language("waitlist_offer_body", {
        title: this.data.eventTitle,
        start: props.startTime,
      }),
    };
  }
}
