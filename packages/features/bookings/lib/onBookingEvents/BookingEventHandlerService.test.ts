import { describe, expect, it, vi } from "vitest";
import { BookingEventHandlerService } from "./BookingEventHandlerService";

function setup(waitlistEnabled = true) {
  const tasker = { create: vi.fn().mockResolvedValue("task-1") };
  const featureRepository = { checkIfFeatureIsEnabledGlobally: vi.fn().mockResolvedValue(true) };
  const service = new BookingEventHandlerService({
    log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    hashedLinkService: { validateAndIncrementUsage: vi.fn() },
    featureRepository,
    eventTypeRepository: { findByIdMinimal: vi.fn().mockResolvedValue({ waitlistEnabled }) },
    tasker,
  });
  return { service, tasker, featureRepository };
}

const slot = {
  uid: "booking-1",
  eventTypeId: 10,
  startTime: new Date("2030-01-01T10:00:00.000Z"),
  endTime: new Date("2030-01-01T11:00:00.000Z"),
};

describe("BookingEventHandlerService waitlist triggers", () => {
  it("enqueues one offer task when a booking is cancelled", async () => {
    const { service, tasker } = setup();
    await service.onBookingCancelled({ payload: { config: { isDryRun: false }, booking: slot } });
    expect(tasker.create).toHaveBeenCalledTimes(1);
    expect(tasker.create).toHaveBeenCalledWith("offerNextWaitlistEntry", {
      eventTypeId: 10,
      startTime: slot.startTime.toISOString(),
      endTime: slot.endTime.toISOString(),
    });
  });

  it("enqueues an offer task when a pending booking is declined", async () => {
    const { service, tasker } = setup();
    await service.onBookingDeclined({ payload: { config: { isDryRun: false }, booking: slot } });
    expect(tasker.create).toHaveBeenCalledTimes(1);
    expect(tasker.create).toHaveBeenCalledWith("offerNextWaitlistEntry", {
      eventTypeId: 10,
      startTime: slot.startTime.toISOString(),
      endTime: slot.endTime.toISOString(),
    });
  });

  it("uses the original slot when a booking is rescheduled away", async () => {
    const { service, tasker } = setup();
    await service.onBookingRescheduled({
      payload: {
        config: { isDryRun: false },
        bookingFormData: { hashedLink: null },
        booking: {
          ...slot,
          startTime: new Date("2030-01-02T10:00:00.000Z"),
          endTime: new Date("2030-01-02T11:00:00.000Z"),
          status: "ACCEPTED",
          userId: null,
        },
        oldBooking: slot,
      },
    });
    expect(tasker.create).toHaveBeenCalledWith("offerNextWaitlistEntry", {
      eventTypeId: 10,
      startTime: slot.startTime.toISOString(),
      endTime: slot.endTime.toISOString(),
    });
  });

  it("does not enqueue when the global flag is disabled", async () => {
    const { service, tasker, featureRepository } = setup();
    vi.mocked(featureRepository.checkIfFeatureIsEnabledGlobally).mockResolvedValue(false);
    await service.onBookingCancelled({ payload: { config: { isDryRun: false }, booking: slot } });
    expect(tasker.create).not.toHaveBeenCalled();
  });

  it("does not enqueue when the event type waitlist is disabled", async () => {
    const { service, tasker } = setup(false);
    await service.onBookingCancelled({ payload: { config: { isDryRun: false }, booking: slot } });
    expect(tasker.create).not.toHaveBeenCalled();
  });

  it("does not fail when waitlist dispatch throws", async () => {
    const { service, tasker } = setup();
    tasker.create.mockRejectedValue(new Error("tasker unavailable"));
    await expect(
      service.onBookingCancelled({ payload: { config: { isDryRun: false }, booking: slot } })
    ).resolves.toBeUndefined();
  });
});
