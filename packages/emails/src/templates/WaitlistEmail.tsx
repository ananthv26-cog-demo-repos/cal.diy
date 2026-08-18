import { decodeHTML } from "entities";
import type { TFunction } from "i18next";
import { BaseEmailHtml } from "../components/BaseEmailHtml";
import { CallToAction } from "../components/CallToAction";

export type WaitlistEmailProps = {
  attendeeName: string;
  eventTitle: string;
  startTime: string;
  expiry?: string;
  claimLink?: string;
  leaveLink: string;
  language: TFunction;
};

const WaitlistEmail = (
  props: WaitlistEmailProps & { mode: "joined" | "offer" | "expired" | "cancelled" }
) => {
  const { language: t } = props;
  const content = {
    joined: {
      subject: decodeHTML(t("waitlist_joined_subject", { title: props.eventTitle })),
      body: decodeHTML(t("waitlist_joined_body", { title: props.eventTitle, start: props.startTime })),
    },
    offer: {
      subject: decodeHTML(t("waitlist_offer_subject", { title: props.eventTitle })),
      body: decodeHTML(t("waitlist_offer_body", { title: props.eventTitle, start: props.startTime })),
    },
    expired: {
      subject: decodeHTML(t("waitlist_offer_expired_subject", { title: props.eventTitle })),
      body: decodeHTML(t("waitlist_offer_expired_body", { title: props.eventTitle, start: props.startTime })),
    },
    cancelled: {
      subject: decodeHTML(t("waitlist_cancelled_subject", { title: props.eventTitle })),
      body: decodeHTML(t("waitlist_cancelled_body", { title: props.eventTitle, start: props.startTime })),
    },
  }[props.mode];

  return (
    <BaseEmailHtml subject={content.subject}>
      <p>{decodeHTML(t("hi_user_name", { name: props.attendeeName }))}!</p>
      <p>{content.body}</p>
      {props.mode === "offer" && props.expiry && (
        <p>{decodeHTML(t("waitlist_offer_expires", { expiry: props.expiry }))}</p>
      )}
      {props.mode === "expired" && <p>{t("waitlist_still_on_list")}</p>}
      {props.mode === "offer" && props.claimLink && (
        <CallToAction label={decodeHTML(t("waitlist_claim_offer"))} href={props.claimLink} />
      )}
      <p>
        <a href={props.leaveLink}>{decodeHTML(t("waitlist_leave"))}</a>
      </p>
    </BaseEmailHtml>
  );
};

export const WaitlistJoinedEmail = (props: WaitlistEmailProps) => <WaitlistEmail {...props} mode="joined" />;
export const WaitlistOfferEmail = (props: WaitlistEmailProps) => <WaitlistEmail {...props} mode="offer" />;
export const WaitlistOfferExpiredEmail = (props: WaitlistEmailProps) => (
  <WaitlistEmail {...props} mode="expired" />
);
export const WaitlistCancelledEmail = (props: WaitlistEmailProps) => (
  <WaitlistEmail {...props} mode="cancelled" />
);
