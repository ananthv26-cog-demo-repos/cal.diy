import renderEmail from "../src/renderEmail";
import { WaitlistEmailBase, type WaitlistEmailData } from "./waitlist-email-base";

export default class WaitlistCancelledEmail extends WaitlistEmailBase {
  constructor(data: WaitlistEmailData) {
    super(data);
    this.name = "WAITLIST_CANCELLED";
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const props = this.getProps();
    return {
      to: this.data.attendeeEmail,
      subject: this.data.language("waitlist_cancelled_subject", { title: this.data.eventTitle }),
      html: await renderEmail("WaitlistCancelledEmail", props),
      text: this.data.language("waitlist_cancelled_body", {
        title: this.data.eventTitle,
        start: props.startTime,
      }),
    };
  }
}
