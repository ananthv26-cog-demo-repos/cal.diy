"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Alert } from "@calcom/ui/components/alert";
import { Button } from "@calcom/ui/components/button";
import { useSearchParams } from "next/navigation";

export default function WaitlistLeavePage() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid");
  const leaveMutation = trpc.viewer.waitlist.leave.useMutation();

  if (!uid) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-12">
        <Alert
          severity="warning"
          title={t("waitlist_leave_invalid_title")}
          message={t("waitlist_leave_invalid_description")}
        />
      </main>
    );
  }

  if (leaveMutation.isError) {
    const isNotFound = leaveMutation.error.data?.code === "NOT_FOUND";
    let title = t("waitlist_leave_unavailable_title");
    let message = t("waitlist_leave_unavailable_description");
    if (isNotFound) {
      title = t("waitlist_leave_invalid_title");
      message = t("waitlist_leave_invalid_description");
    }
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-12">
        <Alert severity="warning" title={title} message={message} />
      </main>
    );
  }

  if (leaveMutation.data) {
    let title = t("waitlist_leave_unavailable_title");
    let message = t("waitlist_leave_unavailable_description");
    if (leaveMutation.data.status === "CLAIMED") {
      title = t("waitlist_leave_claimed_title");
      message = t("waitlist_leave_claimed_description");
    } else if (leaveMutation.data.status === "EXPIRED") {
      title = t("waitlist_leave_expired_title");
      message = t("waitlist_leave_expired_description");
    } else if (leaveMutation.data.status === "CANCELLED") {
      title = t("waitlist_leave_success_title");
      message = t("waitlist_leave_success_description");
    }
    let severity: "warning" | "neutral" = "warning";
    if (leaveMutation.data.status === "CANCELLED") {
      severity = "neutral";
    }

    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-12">
        <Alert severity={severity} title={title} message={message} />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-12">
      <section className="w-full rounded-xl border bg-default p-6 shadow-sm">
        <h1 className="text-xl font-semibold">{t("waitlist_leave_title")}</h1>
        <p className="mt-2 text-subtle">{t("waitlist_leave_description")}</p>
        <Button
          className="mt-6 w-full"
          loading={leaveMutation.isPending}
          disabled={leaveMutation.isPending}
          onClick={() => leaveMutation.mutate({ uid })}>
          {t("waitlist_leave_confirm_button")}
        </Button>
      </section>
    </main>
  );
}
