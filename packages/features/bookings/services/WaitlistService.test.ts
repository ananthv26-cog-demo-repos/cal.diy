import { ErrorCode } from "@calcom/lib/errorCodes";
import { describe, expect, it, vi } from "vitest";

vi.mock("@calcom/emails/email-manager", () => ({
  sendWaitlistCancelledEmail: vi.fn(),
  sendWaitlistJoinedEmail: vi.fn(),
  sendWaitlistOfferEmail: vi.fn(),
  sendWaitlistOfferExpiredEmail: vi.fn(),
}));

import { sendWaitlistJoinedEmail } from "@calcom/emails/email-manager";
import type { WaitlistEntryRecord } from "../repositories/IWaitlistEntryRepository";
import { WaitlistService } from "./WaitlistService";

const slotStart = new Date("2030-01-01T10:00:00.000Z");
const slotEnd = new Date("2030-01-01T11:00:00.000Z");

function entry(overrides: Partial<WaitlistEntryRecord> = {}): WaitlistEntryRecord {
  return {
    id: 1,
    uid: "entry-1",
    eventTypeId: 10,
    startTime: slotStart,
    endTime: slotEnd,
    attendeeName: "Attendee",
    attendeeEmail: "attendee@example.com",
    attendeeTimeZone: "UTC",
    responses: null,
    status: "PENDING",
    offeredAt: null,
    offerExpiresAt: null,
    claimedBookingId: null,
    createdAt: new Date("2029-12-01T00:00:00.000Z"),
    updatedAt: new Date("2029-12-01T00:00:00.000Z"),
    ...overrides,
  };
}

function setup() {
  const waitlistEntryRepository = {
    create: vi.fn(),
    findById: vi.fn(),
    findByUid: vi.fn(),
    findByOfferToken: vi.fn(),
    findBySlotAndEmail: vi.fn(),
    findNextPendingForSlot: vi.fn(),
    countActiveForSlot: vi.fn(),
    listForEventType: vi.fn(),
    transitionStatus: vi.fn(),
    expireStaleOffers: vi.fn(),
    listActiveBefore: vi.fn().mockResolvedValue([]),
  };
  const selectedSlotRepository = {
    reserveForWaitlist: vi.fn().mockResolvedValue(true),
    releaseForWaitlist: vi.fn().mockResolvedValue(undefined),
    findReservedByOthers: vi.fn(),
    findManyReservedByOthers: vi.fn(),
    findManyUnexpiredSlots: vi.fn(),
    deleteManyExpiredSlots: vi.fn(),
  };
  const eventTypeRepository = {
    findByIdMinimal: vi.fn().mockResolvedValue({
      id: 10,
      teamId: null,
      schedulingType: null,
      seatsPerTimeSlot: null,
      recurringEvent: false,
      waitlistEnabled: true,
      waitlistMaxSize: 20,
      title: "Test event",
    }),
  };
  const availableSlotsService = {
    getAvailableSlots: vi.fn().mockResolvedValue({ slots: {} }),
  };
  const featureRepository = {
    checkIfFeatureIsEnabledGlobally: vi.fn().mockResolvedValue(true),
  };
  const tasker = {
    create: vi.fn().mockResolvedValue("task-1"),
    cleanup: vi.fn(),
    cancel: vi.fn(),
    cancelWithReference: vi.fn(),
  };
  const regularBookingService = {
    createBooking: vi.fn().mockResolvedValue({ id: 42, uid: "booking-1" }),
  };
  const service = new WaitlistService({
    waitlistEntryRepository,
    selectedSlotRepository,
    eventTypeRepository,
    availableSlotsService,
    featureRepository,
    tasker,
    regularBookingService,
    now: () => new Date("2029-12-31T12:00:00.000Z"),
  });

  return {
    service,
    waitlistEntryRepository,
    selectedSlotRepository,
    eventTypeRepository,
    availableSlotsService,
    featureRepository,
    tasker,
    regularBookingService,
  };
}

describe("WaitlistService", () => {
  it("rejects joining when the requested slot is bookable", async () => {
    const { service, availableSlotsService, waitlistEntryRepository } = setup();
    availableSlotsService.getAvailableSlots.mockResolvedValue({
      slots: { day: [{ time: slotStart.toISOString() }] },
    });

    await expect(
      service.join({
        eventTypeId: 10,
        startTime: slotStart,
        endTime: slotEnd,
        attendee: { name: "A", email: "a@example.com", timeZone: "UTC" },
      })
    ).rejects.toMatchObject({ code: "bad_request_error" });
    expect(waitlistEntryRepository.create).not.toHaveBeenCalled();
  });

  it("returns the existing entry for an idempotent join", async () => {
    const { service, waitlistEntryRepository, availableSlotsService } = setup();
    const existing = entry();
    waitlistEntryRepository.findBySlotAndEmail.mockResolvedValue(existing);
    availableSlotsService.getAvailableSlots.mockResolvedValue({
      slots: { day: [{ time: slotStart.toISOString() }] },
    });

    await expect(
      service.join({
        eventTypeId: 10,
        startTime: slotStart,
        endTime: slotEnd,
        attendee: { name: "A", email: existing.attendeeEmail, timeZone: "UTC" },
      })
    ).resolves.toBe(existing);
    expect(waitlistEntryRepository.create).not.toHaveBeenCalled();
  });

  it("uses event type team-ness and attendee timezone for availability", async () => {
    const { service, eventTypeRepository, availableSlotsService, waitlistEntryRepository } = setup();
    eventTypeRepository.findByIdMinimal.mockResolvedValue({
      id: 10,
      teamId: 123,
      schedulingType: "ROUND_ROBIN",
      seatsPerTimeSlot: null,
      recurringEvent: false,
      waitlistEnabled: true,
      waitlistMaxSize: 20,
    });
    availableSlotsService.getAvailableSlots.mockResolvedValue({
      slots: {},
    });
    waitlistEntryRepository.create.mockResolvedValue(entry());

    await service.join({
      eventTypeId: 10,
      startTime: slotStart,
      endTime: slotEnd,
      attendee: { name: "A", email: "a@example.com", timeZone: "America/New_York" },
    });

    expect(availableSlotsService.getAvailableSlots).toHaveBeenCalledWith({
      input: {
        eventTypeId: 10,
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        timeZone: "America/New_York",
        isTeamEvent: true,
      },
    });
    expect(waitlistEntryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ uid: expect.any(String) })
    );
  });

  it("keeps a successful join when the confirmation email fails", async () => {
    const { service, waitlistEntryRepository, availableSlotsService } = setup();
    const created = entry();
    waitlistEntryRepository.create.mockResolvedValue(created);
    availableSlotsService.getAvailableSlots.mockResolvedValue({ slots: {} });
    vi.mocked(sendWaitlistJoinedEmail).mockRejectedValueOnce(new Error("smtp unavailable"));

    await expect(
      service.join({
        eventTypeId: 10,
        startTime: slotStart,
        endTime: slotEnd,
        attendee: { name: "A", email: "a@example.com", timeZone: "UTC" },
      })
    ).resolves.toBe(created);
  });

  it("offers the oldest pending entry first and schedules expiry", async () => {
    const { service, waitlistEntryRepository, tasker, availableSlotsService } = setup();
    const pending = entry();
    waitlistEntryRepository.findNextPendingForSlot.mockResolvedValue(pending);
    waitlistEntryRepository.transitionStatus.mockResolvedValue({ count: 1 });
    availableSlotsService.getAvailableSlots.mockResolvedValue({
      slots: { day: [{ time: slotStart.toISOString() }] },
    });

    const offered = await service.offerNextForSlot({
      eventTypeId: 10,
      startTime: slotStart,
      endTime: slotEnd,
    });

    expect(offered?.status).toBe("OFFERED");
    expect(offered?.offerExpiresAt?.getTime()).toBe(new Date("2029-12-31T12:30:00.000Z").getTime());
    expect(waitlistEntryRepository.transitionStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStatus: "PENDING",
        data: expect.objectContaining({ status: "OFFERED" }),
      })
    );
    expect(tasker.create).toHaveBeenCalledWith(
      "expireWaitlistOffer",
      { entryId: pending.id },
      expect.objectContaining({ scheduledAt: offered?.offerExpiresAt })
    );
  });

  it("no-ops when another offer already holds the reservation", async () => {
    const { service, waitlistEntryRepository, selectedSlotRepository, availableSlotsService } = setup();
    waitlistEntryRepository.findNextPendingForSlot.mockResolvedValue(entry());
    selectedSlotRepository.reserveForWaitlist.mockResolvedValue(false);
    availableSlotsService.getAvailableSlots.mockResolvedValue({
      slots: { day: [{ time: slotStart.toISOString() }] },
    });

    await expect(
      service.offerNextForSlot({ eventTypeId: 10, startTime: slotStart, endTime: slotEnd })
    ).resolves.toBeNull();
    expect(waitlistEntryRepository.transitionStatus).not.toHaveBeenCalled();
  });

  it("expires an offer and cascades to the next pending entry", async () => {
    const { service, waitlistEntryRepository, availableSlotsService } = setup();
    const offered = entry({
      status: "OFFERED",
      offerExpiresAt: new Date("2029-12-31T11:15:00.000Z"),
    });
    waitlistEntryRepository.findById.mockResolvedValue(offered);
    waitlistEntryRepository.transitionStatus.mockResolvedValueOnce({ count: 1 });
    waitlistEntryRepository.findNextPendingForSlot.mockResolvedValue(null);
    availableSlotsService.getAvailableSlots.mockResolvedValue({
      slots: { day: [{ time: slotStart.toISOString() }] },
    });

    await service.expireOffer({ entryId: offered.id });

    expect(waitlistEntryRepository.transitionStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        id: offered.id,
        expectedStatus: "OFFERED",
        data: { status: "EXPIRED" },
      })
    );
    expect(waitlistEntryRepository.findNextPendingForSlot).toHaveBeenCalled();
  });

  it("rejects a claim after its offer expires", async () => {
    const { service, waitlistEntryRepository } = setup();
    const offered = entry({
      status: "OFFERED",
      offerExpiresAt: new Date("2029-12-31T11:15:00.000Z"),
    });
    waitlistEntryRepository.findByOfferToken.mockResolvedValue(offered);
    waitlistEntryRepository.findById.mockResolvedValue(offered);
    waitlistEntryRepository.transitionStatus.mockResolvedValue({ count: 1 });

    await expect(service.claim({ offerToken: "expired-token" })).rejects.toMatchObject({
      code: "bad_request_error",
    });
    expect(waitlistEntryRepository.transitionStatus).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "EXPIRED" } })
    );
  });

  it("returns authoritative offer preview states", async () => {
    const { service, waitlistEntryRepository, eventTypeRepository } = setup();
    const offered = entry({
      status: "OFFERED",
      offerExpiresAt: new Date("2030-01-01T12:30:00.000Z"),
    });
    waitlistEntryRepository.findByOfferToken.mockResolvedValue(offered);

    await expect(service.getOfferPreview({ offerToken: "offer-token" })).resolves.toMatchObject({
      status: "OFFERED",
      entry: offered,
      eventTitle: "Test event",
    });

    for (const status of ["EXPIRED", "CLAIMED", "CANCELLED"] as const) {
      waitlistEntryRepository.findByOfferToken.mockResolvedValueOnce(entry({ status }));
      await expect(service.getOfferPreview({ offerToken: `${status}-token` })).resolves.toMatchObject({
        status,
        entry: null,
        eventTitle: null,
      });
    }

    waitlistEntryRepository.findByOfferToken.mockResolvedValueOnce(null);
    await expect(service.getOfferPreview({ offerToken: "unknown-token" })).resolves.toEqual({
      status: "NOT_FOUND",
      entry: null,
      eventTitle: null,
    });
    expect(eventTypeRepository.findByIdMinimal).toHaveBeenCalled();
  });

  it("passes attendee responses under the booking responses field", async () => {
    const { service, waitlistEntryRepository, regularBookingService } = setup();
    const offered = entry({
      status: "OFFERED",
      offerExpiresAt: new Date("2029-12-31T12:15:00.000Z"),
      responses: { guests: [], customAnswer: "value" },
    });
    waitlistEntryRepository.findByOfferToken.mockResolvedValue(offered);
    waitlistEntryRepository.transitionStatus.mockResolvedValue({ count: 1 });

    const result = await service.claim({ offerToken: "offer-token" });

    expect(regularBookingService.createBooking).toHaveBeenCalledWith({
      bookingData: {
        eventTypeId: offered.eventTypeId,
        start: offered.startTime.toISOString(),
        end: offered.endTime.toISOString(),
        timeZone: offered.attendeeTimeZone,
        language: "en",
        metadata: {},
        creationSource: "WEBAPP",
        responses: {
          guests: [],
          customAnswer: "value",
          name: offered.attendeeName,
          email: offered.attendeeEmail,
        },
      },
    });
    expect(result.booking).toEqual({ id: 42, uid: "booking-1" });
    expect(result.entry).toMatchObject({
      status: "CLAIMED",
      claimedBookingId: 42,
    });
  });

  it("does not expire an offer when the claim transition loses a race", async () => {
    const { service, waitlistEntryRepository } = setup();
    const offered = entry({
      status: "OFFERED",
      offerExpiresAt: new Date("2029-12-31T12:15:00.000Z"),
    });
    waitlistEntryRepository.findByOfferToken.mockResolvedValue(offered);
    waitlistEntryRepository.transitionStatus.mockResolvedValue({ count: 0 });
    waitlistEntryRepository.findById.mockClear();

    await expect(service.claim({ offerToken: "offer-token" })).rejects.toMatchObject({
      code: "bad_request_error",
    });
    expect(waitlistEntryRepository.findById).not.toHaveBeenCalled();
  });

  it("expires without cascading when booking reports an unavailable slot", async () => {
    const { service, waitlistEntryRepository, regularBookingService } = setup();
    const offered = entry({
      status: "OFFERED",
      offerExpiresAt: new Date("2029-12-31T12:15:00.000Z"),
    });
    waitlistEntryRepository.findByOfferToken.mockResolvedValue(offered);
    waitlistEntryRepository.findById.mockResolvedValue(offered);
    waitlistEntryRepository.transitionStatus.mockResolvedValue({ count: 1 });
    regularBookingService.createBooking.mockRejectedValue(new Error(ErrorCode.BookingConflict));

    await expect(service.claim({ offerToken: "offer-token" })).rejects.toThrow(ErrorCode.BookingConflict);
    expect(waitlistEntryRepository.findNextPendingForSlot).not.toHaveBeenCalled();
  });

  it("sweeps past entries and stale offers", async () => {
    const { service, waitlistEntryRepository } = setup();
    const past = entry({
      startTime: new Date("2029-12-30T10:00:00.000Z"),
      endTime: new Date("2029-12-30T11:00:00.000Z"),
    });
    waitlistEntryRepository.listActiveBefore.mockResolvedValue([past]);
    waitlistEntryRepository.transitionStatus.mockResolvedValue({ count: 1 });

    await service.sweep();

    expect(waitlistEntryRepository.expireStaleOffers).toHaveBeenCalledWith({
      now: new Date("2029-12-31T12:00:00.000Z"),
    });
    expect(waitlistEntryRepository.listActiveBefore).toHaveBeenCalledWith({
      now: new Date("2029-12-31T12:00:00.000Z"),
      limit: 100,
    });
    expect(waitlistEntryRepository.transitionStatus).toHaveBeenCalledWith({
      id: past.id,
      expectedStatus: "PENDING",
      data: { status: "CANCELLED" },
    });
  });
});
