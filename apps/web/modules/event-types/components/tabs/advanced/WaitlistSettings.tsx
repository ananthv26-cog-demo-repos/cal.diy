import dayjs from "@calcom/dayjs";
import type { FormValues } from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { SettingsToggle, TextField } from "@calcom/ui/components/form";
import { useFlags } from "@calcom/web/modules/feature-flags/hooks/useFlags";
import { useEffect, useRef, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

type WaitlistSettingsProps = {
  eventTypeId: number;
  showToast: (message: string, variant: "success" | "warning" | "error") => void;
};

export const WaitlistSettings = ({ eventTypeId, showToast }: WaitlistSettingsProps) => {
  const { t } = useLocale();
  const flags = useFlags();
  const formMethods = useFormContext<FormValues>();
  const waitlistEnabled = formMethods.watch("waitlistEnabled");
  const seatsPerTimeSlot = formMethods.watch("seatsPerTimeSlot");
  const recurringEvent = formMethods.watch("recurringEvent");
  const waitlistUnavailable = Boolean(seatsPerTimeSlot || recurringEvent);
  const waitlistMaxSize = formMethods.watch("waitlistMaxSize");
  const [maxSizeInput, setMaxSizeInput] = useState(() =>
    waitlistMaxSize === null || waitlistMaxSize === undefined ? "" : String(waitlistMaxSize)
  );
  const lastFormMaxSize = useRef(waitlistMaxSize);
  useEffect(() => {
    if (waitlistMaxSize === lastFormMaxSize.current) return;
    lastFormMaxSize.current = waitlistMaxSize;
    setMaxSizeInput(waitlistMaxSize === null || waitlistMaxSize === undefined ? "" : String(waitlistMaxSize));
  }, [waitlistMaxSize]);
  const entriesQuery = trpc.viewer.waitlist.listForEventType.useQuery(
    { eventTypeId },
    { enabled: Boolean(flags["slot-waitlist"] && waitlistEnabled && !waitlistUnavailable) }
  );
  const utils = trpc.useUtils();
  const removeMutation = trpc.viewer.waitlist.remove.useMutation({
    onSuccess: async () => {
      await utils.viewer.waitlist.listForEventType.invalidate({ eventTypeId });
    },
    onError: () => {
      showToast(t("waitlist_remove_error"), "error");
    },
  });

  if (!flags["slot-waitlist"]) return null;

  const statusLabels = {
    PENDING: t("waitlist_status_pending"),
    OFFERED: t("waitlist_status_offered"),
    CLAIMED: t("waitlist_status_claimed"),
    EXPIRED: t("waitlist_status_expired"),
    CANCELLED: t("waitlist_status_cancelled"),
  };
  const activeEntries = entriesQuery.data?.filter(
    (entry) => entry.status === "PENDING" || entry.status === "OFFERED" || entry.status === "CLAIMED"
  );
  const waitlistDescription = waitlistUnavailable
    ? `${t("waitlist_settings_description")} ${t("waitlist_unavailable_for_event_type")}`
    : t("waitlist_settings_description");

  return (
    <>
      <Controller
        name="waitlistEnabled"
        render={({ field: { value, onChange } }) => (
          <SettingsToggle
            labelClassName="text-sm"
            toggleSwitchAtTheEnd
            switchContainerClassName="rounded-lg border border-subtle px-4 py-6 sm:px-6"
            title={t("waitlist_settings_title")}
            description={waitlistDescription}
            checked={value}
            disabled={waitlistUnavailable}
            onCheckedChange={(enabled) => onChange(enabled)}>
            {waitlistEnabled && !waitlistUnavailable && (
              <div className="rounded-b-lg border border-subtle border-t-0 p-6">
                <Controller
                  name="waitlistMaxSize"
                  render={({ field: { onChange: setMaxSize } }) => (
                    <TextField
                      type="number"
                      min={1}
                      step={1}
                      label={t("waitlist_max_size_label")}
                      hint={t("waitlist_max_size_description")}
                      value={maxSizeInput}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setMaxSizeInput(nextValue);
                        if (!nextValue) {
                          setMaxSize(null);
                          return;
                        }
                        const parsedValue = Number(nextValue);
                        if (Number.isInteger(parsedValue) && parsedValue >= 1) {
                          setMaxSize(parsedValue);
                        }
                      }}
                    />
                  )}
                />
              </div>
            )}
          </SettingsToggle>
        )}
      />
      {waitlistEnabled && !waitlistUnavailable && (
        <section className="mt-6 rounded-lg border border-subtle p-6">
          <h3 className="font-medium text-emphasis">{t("waitlist_list_title")}</h3>
          {entriesQuery.isPending ? (
            <p className="mt-3 text-sm text-subtle">{t("loading")}</p>
          ) : entriesQuery.error ? (
            <p className="mt-3 text-error text-sm">{t("waitlist_list_error")}</p>
          ) : activeEntries?.length ? (
            <div className="mt-4 space-y-3">
              {activeEntries.map((entry) => (
                <div
                  className="flex flex-col gap-3 rounded-lg border border-subtle p-4 sm:flex-row sm:items-center sm:justify-between"
                  key={entry.uid}>
                  <div className="text-sm">
                    <p className="font-medium text-emphasis">{entry.attendeeName}</p>
                    <p className="text-subtle">{entry.attendeeEmail}</p>
                    <p className="text-subtle">
                      {dayjs(entry.startTime).tz(entry.attendeeTimeZone).format("MMM D, YYYY h:mm A")} ·{" "}
                      {t("waitlist_attendee_timezone", { timezone: entry.attendeeTimeZone })} ·{" "}
                      {statusLabels[entry.status]}
                    </p>
                  </div>
                  {entry.status !== "CLAIMED" && (
                    <Button
                      color="secondary"
                      size="sm"
                      loading={removeMutation.isPending && removeMutation.variables?.uid === entry.uid}
                      onClick={() => removeMutation.mutate({ eventTypeId, uid: entry.uid })}>
                      {t("waitlist_remove_button")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-subtle">{t("waitlist_list_empty")}</p>
          )}
        </section>
      )}
    </>
  );
};
