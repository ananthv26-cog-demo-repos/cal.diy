"use client";

import dayjs from "@calcom/dayjs";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Alert } from "@calcom/ui/components/alert";
import { Button } from "@calcom/ui/components/button";
import { useParams, useRouter, useSearchParams } from "next/navigation";

export default function WaitlistClaimPage() {
  const { t } = useLocale();
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const claimMutation = trpc.viewer.waitlist.claim.useMutation({
    onSuccess: (result) => {
      if (result.booking.uid) {
        router.replace(`/booking-successful/${result.booking.uid}`);
      }
    },
  });

  const token = params.token;
  const eventTitle = searchParams.get("eventTitle") || t("waitlist_offer_title");
  const attendeeTimeZone = searchParams.get("attendeeTimeZone") || "UTC";
  const startTime = searchParams.get("startTime");
  const endTime = searchParams.get("endTime");
  const offerExpiresAt = searchParams.get("offerExpiresAt");
  const formattedStart = startTime
    ? dayjs(startTime).tz(attendeeTimeZone).format("dddd, MMMM D, YYYY h:mm A z")
    : null;
  const formattedEnd = endTime ? dayjs(endTime).tz(attendeeTimeZone).format("h:mm A z") : null;
  const formattedExpiry = offerExpiresAt
    ? dayjs(offerExpiresAt).tz(attendeeTimeZone).format("dddd, MMMM D, YYYY h:mm A z")
    : null;
  const errorCode = claimMutation.error?.data?.code;
  const errorTitle =
    errorCode === "NOT_FOUND" ? t("waitlist_offer_invalid_title") : t("waitlist_offer_unavailable_title");
  const errorMessage =
    errorCode === "NOT_FOUND"
      ? t("waitlist_offer_invalid_description")
      : t("waitlist_offer_unavailable_description");

  if (claimMutation.isError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-12">
        <Alert severity="warning" title={errorTitle} message={errorMessage} />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-12">
      <section className="w-full rounded-xl border bg-default p-6 shadow-sm">
        <h1 className="text-xl font-semibold">{t("waitlist_claim_title")}</h1>
        <p className="mt-2 text-subtle">{t("waitlist_claim_description")}</p>
        <dl className="mt-6 space-y-4 text-sm">
          <div>
            <dt className="font-medium">{t("waitlist_event_label")}</dt>
            <dd className="text-subtle">{eventTitle}</dd>
          </div>
          {formattedStart && (
            <div>
              <dt className="font-medium">{t("waitlist_slot_label")}</dt>
              <dd className="text-subtle">
                {formattedStart}
                {formattedEnd ? ` – ${formattedEnd}` : ""}
              </dd>
            </div>
          )}
          {formattedExpiry && (
            <div>
              <dt className="font-medium">{t("waitlist_expiry_label")}</dt>
              <dd className="text-subtle">{formattedExpiry}</dd>
            </div>
          )}
        </dl>
        <Button
          className="mt-6 w-full"
          loading={claimMutation.isPending}
          onClick={() => claimMutation.mutate({ offerToken: token })}>
          {t("waitlist_claim_button")}
        </Button>
      </section>
    </main>
  );
}
