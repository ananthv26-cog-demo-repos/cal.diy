import { ErrorCode } from "@calcom/lib/errorCodes";
import { describe, expect, it, vi } from "vitest";
import type { WaitlistEntryRecord } from "../repositories/IWaitlistEntryRepository";
import { WaitlistService } from "./WaitlistService";

const slotStart = new Date("2030-01-01T10:00:00.000Z");
const slotEnd = new Date("2030-01-01T11:00:00.000Z");

class BookingConflictWithCode extends Error {
  code = "unexpected_error";

  constructor() {
    super(ErrorCode.BookingConflict);
  }
}

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
    transitionStatus: vi.fn().mockResolvedValue({ count: 1 }),
    expireStaleOffers: vi.fn(),
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
      length: 60,
      metadata: null,
      seatsPerTimeSlot: null,
      recurringEvent: false,
      waitlistEnabled: true,
      waitlistMaxSize: 20,
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
    createBooking: vi.fn().mockResolvedValue({ id: 42 }),
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

  it("rejects a join with an unsupported duration", async () => {
    const { service, availableSlotsService, waitlistEntryRepository } = setup();
    availableSlotsService.getAvailableSlots.mockResolvedValue({ slots: {} });

    await expect(
      service.join({
        eventTypeId: 10,
        startTime: slotStart,
        endTime: new Date("2030-01-01T11:30:00.000Z"),
        attendee: { name: "A", email: "a@example.com", timeZone: "UTC" },
      })
    ).rejects.toMatchObject({
      code: "bad_request_error",
      message: "The waitlist slot duration is not supported",
    });
    expect(waitlistEntryRepository.create).not.toHaveBeenCalled();
  });

  it("rejects a join whose end is not after its start", async () => {
    const { service, availableSlotsService, waitlistEntryRepository } = setup();
    availableSlotsService.getAvailableSlots.mockResolvedValue({ slots: {} });

    await expect(
      service.join({
        eventTypeId: 10,
        startTime: slotStart,
        endTime: slotStart,
        attendee: { name: "A", email: "a@example.com", timeZone: "UTC" },
      })
    ).rejects.toMatchObject({
      code: "bad_request_error",
      message: "The waitlist slot must end after it starts",
    });
    expect(waitlistEntryRepository.create).not.toHaveBeenCalled();
  });

  it("accepts a valid multiple duration", async () => {
    const { service, eventTypeRepository, availableSlotsService, waitlistEntryRepository } = setup();
    eventTypeRepository.findByIdMinimal.mockResolvedValue({
      id: 10,
      teamId: null,
      schedulingType: null,
      length: 30,
      metadata: { multipleDuration: [60] },
      seatsPerTimeSlot: null,
      recurringEvent: false,
      waitlistEnabled: true,
      waitlistMaxSize: 20,
    });
    availableSlotsService.getAvailableSlots.mockResolvedValue({ slots: {} });
    waitlistEntryRepository.create.mockResolvedValue(entry());

    await expect(
      service.join({
        eventTypeId: 10,
        startTime: slotStart,
        endTime: slotEnd,
        attendee: { name: "A", email: "a@example.com", timeZone: "UTC" },
      })
    ).resolves.toMatchObject({ status: "PENDING" });
  });

  it("reactivates a cancelled entry after running join validations", async () => {
    const { service, waitlistEntryRepository, availableSlotsService } = setup();
    const cancelled = entry({ status: "CANCELLED" });
    waitlistEntryRepository.findBySlotAndEmail.mockResolvedValue(cancelled);
    waitlistEntryRepository.transitionStatus.mockResolvedValue({ count: 1 });
    availableSlotsService.getAvailableSlots.mockResolvedValue({ slots: {} });

    await expect(
      service.join({
        eventTypeId: 10,
        startTime: slotStart,
        endTime: slotEnd,
        attendee: { name: "A", email: cancelled.attendeeEmail, timeZone: "UTC" },
      })
    ).resolves.toMatchObject({ id: cancelled.id, status: "PENDING", offerExpiresAt: null });
    expect(waitlistEntryRepository.transitionStatus).toHaveBeenCalledWith({
      id: cancelled.id,
      expectedStatus: "CANCELLED",
      data: {
        status: "PENDING",
        offerToken: null,
        offeredAt: null,
        offerExpiresAt: null,
        claimedBookingId: null,
      },
    });
  });

  it("reactivates an expired entry after running join validations", async () => {
    const { service, waitlistEntryRepository, availableSlotsService } = setup();
    const expired = entry({ status: "EXPIRED" });
    waitlistEntryRepository.findBySlotAndEmail.mockResolvedValue(expired);
    waitlistEntryRepository.transitionStatus.mockResolvedValue({ count: 1 });
    availableSlotsService.getAvailableSlots.mockResolvedValue({ slots: {} });

    await expect(
      service.join({
        eventTypeId: 10,
        startTime: slotStart,
        endTime: slotEnd,
        attendee: { name: "A", email: expired.attendeeEmail, timeZone: "UTC" },
      })
    ).resolves.toMatchObject({ id: expired.id, status: "PENDING", offerExpiresAt: null });
    expect(waitlistEntryRepository.transitionStatus).toHaveBeenCalledWith(
      expect.objectContaining({ expectedStatus: "EXPIRED" })
    );
  });

  it("rejects rejoining a claimed entry", async () => {
    const { service, waitlistEntryRepository } = setup();
    waitlistEntryRepository.findBySlotAndEmail.mockResolvedValue(entry({ status: "CLAIMED" }));

    await expect(
      service.join({
        eventTypeId: 10,
        startTime: slotStart,
        endTime: slotEnd,
        attendee: { name: "A", email: "attendee@example.com", timeZone: "UTC" },
      })
    ).rejects.toMatchObject({ code: "bad_request_error", message: "You already booked this slot" });
  });

  it("uses event type team-ness and attendee timezone for availability", async () => {
    const { service, eventTypeRepository, availableSlotsService, waitlistEntryRepository } = setup();
    eventTypeRepository.findByIdMinimal.mockResolvedValue({
      id: 10,
      teamId: 123,
      schedulingType: "ROUND_ROBIN",
      length: 60,
      metadata: null,
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

    await expect(service.offerNextForSlot({ eventTypeId: 10, startTime: slotStart })).resolves.toBeNull();
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
        data: { status: "EXPIRED", offerToken: null },
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
      expect.objectContaining({ data: { status: "EXPIRED", offerToken: null } })
    );
  });

  it("compensates an offered entry when scheduling expiry fails", async () => {
    const { service, waitlistEntryRepository, selectedSlotRepository, tasker, availableSlotsService } =
      setup();
    const pending = entry();
    waitlistEntryRepository.findNextPendingForSlot.mockResolvedValue(pending);
    waitlistEntryRepository.transitionStatus
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    tasker.create.mockRejectedValue(new Error("tasker unavailable"));
    availableSlotsService.getAvailableSlots.mockResolvedValue({
      slots: { day: [{ time: slotStart.toISOString() }] },
    });

    await expect(service.offerNextForSlot({ eventTypeId: 10, startTime: slotStart })).rejects.toThrow(
      "tasker unavailable"
    );
    expect(waitlistEntryRepository.transitionStatus).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        expectedStatus: "OFFERED",
        data: expect.objectContaining({ status: "EXPIRED" }),
      })
    );
    expect(selectedSlotRepository.releaseForWaitlist).toHaveBeenCalledWith({
      eventTypeId: 10,
      slot: { utcStartIso: slotStart.toISOString(), utcEndIso: slotEnd.toISOString() },
      uid: pending.uid,
    });
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

    await service.claim({ offerToken: "offer-token" });

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
  });

  it("allows only one concurrent claim to consume an offer", async () => {
    const { service, waitlistEntryRepository, regularBookingService } = setup();
    const offered = entry({
      status: "OFFERED",
      offerExpiresAt: new Date("2029-12-31T12:15:00.000Z"),
    });
    waitlistEntryRepository.findByOfferToken.mockResolvedValue(offered);
    let consumed = false;
    waitlistEntryRepository.transitionStatus.mockImplementation(async ({ expectedStatus, data }) => {
      if (expectedStatus === "OFFERED" && data.status === "CLAIMED") {
        if (consumed) {
          return { count: 0 };
        }
        consumed = true;
      }
      return { count: 1 };
    });

    const results = await Promise.allSettled([
      service.claim({ offerToken: "offer-token" }),
      service.claim({ offerToken: "offer-token" }),
    ]);

    expect(regularBookingService.createBooking).toHaveBeenCalledTimes(1);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "not_found_error" },
    });
  });

  it("cleans up the reservation and expiry task after a successful claim", async () => {
    const { service, waitlistEntryRepository, selectedSlotRepository, tasker } = setup();
    const offered = entry({
      status: "OFFERED",
      offerExpiresAt: new Date("2029-12-31T12:15:00.000Z"),
    });
    waitlistEntryRepository.findByOfferToken.mockResolvedValue(offered);
    waitlistEntryRepository.transitionStatus.mockResolvedValue({ count: 1 });

    await expect(service.claim({ offerToken: "offer-token" })).resolves.toEqual({ id: 42 });
    expect(selectedSlotRepository.releaseForWaitlist).toHaveBeenCalledWith({
      eventTypeId: offered.eventTypeId,
      slot: {
        utcStartIso: offered.startTime.toISOString(),
        utcEndIso: offered.endTime.toISOString(),
      },
      uid: offered.uid,
    });
    expect(tasker.cancelWithReference).toHaveBeenCalledWith(offered.uid, "expireWaitlistOffer");
  });

  it("expires without cascading when booking reports an unavailable slot", async () => {
    const { service, waitlistEntryRepository, regularBookingService, selectedSlotRepository } = setup();
    const offered = entry({
      status: "OFFERED",
      offerExpiresAt: new Date("2029-12-31T12:15:00.000Z"),
    });
    waitlistEntryRepository.findByOfferToken.mockResolvedValue(offered);
    waitlistEntryRepository.findById.mockResolvedValue(offered);
    waitlistEntryRepository.transitionStatus
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    regularBookingService.createBooking.mockRejectedValue(new BookingConflictWithCode());

    await expect(service.claim({ offerToken: "offer-token" })).rejects.toThrow(ErrorCode.BookingConflict);
    expect(waitlistEntryRepository.transitionStatus).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ expectedStatus: "CLAIMED", data: { status: "EXPIRED", offerToken: null } })
    );
    expect(selectedSlotRepository.releaseForWaitlist).toHaveBeenCalledWith({
      eventTypeId: offered.eventTypeId,
      slot: {
        utcStartIso: offered.startTime.toISOString(),
        utcEndIso: offered.endTime.toISOString(),
      },
      uid: offered.uid,
    });
    expect(waitlistEntryRepository.findNextPendingForSlot).not.toHaveBeenCalled();
  });

  it("expires and cascades when booking fails for a non-slot error", async () => {
    const { service, waitlistEntryRepository, regularBookingService, availableSlotsService } = setup();
    const offered = entry({
      status: "OFFERED",
      offerExpiresAt: new Date("2029-12-31T12:15:00.000Z"),
    });
    waitlistEntryRepository.findByOfferToken.mockResolvedValue(offered);
    waitlistEntryRepository.findById.mockResolvedValue(offered);
    waitlistEntryRepository.transitionStatus
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    regularBookingService.createBooking.mockRejectedValue(new Error("booking failed"));
    availableSlotsService.getAvailableSlots.mockResolvedValue({ slots: {} });

    await expect(service.claim({ offerToken: "offer-token" })).rejects.toThrow("booking failed");
    expect(waitlistEntryRepository.findNextPendingForSlot).toHaveBeenCalledWith({
      eventTypeId: offered.eventTypeId,
      startTime: offered.startTime,
    });
  });
});
