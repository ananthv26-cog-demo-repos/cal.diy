import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import { decodeHTML } from "entities";
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
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: this.getRecipient(),
      subject: decodeHTML(this.data.language("waitlist_cancelled_subject", { title: this.data.eventTitle })),
      html: await renderEmail("WaitlistCancelledEmail", props),
      text: [
        decodeHTML(
          this.data.language("waitlist_cancelled_body", {
            title: this.data.eventTitle,
            start: props.startTime,
          })
        ),
        `${decodeHTML(this.data.language("waitlist_leave"))}: ${props.leaveLink}`,
      ].join("\n"),
    };
  }
}
