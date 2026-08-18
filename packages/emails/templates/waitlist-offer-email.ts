import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import { decodeHTML } from "entities";
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
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: this.getRecipient(),
      subject: decodeHTML(this.data.language("waitlist_offer_subject", { title: this.data.eventTitle })),
      html: await renderEmail("WaitlistOfferEmail", props),
      text: [
        decodeHTML(
          this.data.language("waitlist_offer_body", {
            title: this.data.eventTitle,
            start: props.startTime,
          })
        ),
        props.expiry &&
          `${decodeHTML(this.data.language("waitlist_offer_expires", { expiry: props.expiry }))}`,
        props.claimLink && `${decodeHTML(this.data.language("waitlist_claim_offer"))}: ${props.claimLink}`,
        `${decodeHTML(this.data.language("waitlist_leave"))}: ${props.leaveLink}`,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
    };
  }
}
