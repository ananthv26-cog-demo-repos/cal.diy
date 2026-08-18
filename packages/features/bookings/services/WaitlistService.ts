import { randomBytes } from "node:crypto";
import {
  sendWaitlistCancelledEmail,
  sendWaitlistJoinedEmail,
  sendWaitlistOfferEmail,
  sendWaitlistOfferExpiredEmail,
} from "@calcom/emails/email-manager";
import type { RegularBookingService } from "@calcom/features/bookings/lib/service/RegularBookingService";
import type {
  IWaitlistEntryRepository,
  WaitlistEntryCreateData,
  WaitlistEntryJson,
  WaitlistEntryRecord,
} from "@calcom/features/bookings/repositories/IWaitlistEntryRepository";
import type { IFeatureRepository } from "@calcom/features/flags/repositories/PrismaFeatureRepository";
import type { ISelectedSlotRepository } from "@calcom/features/selectedSlots/repositories/ISelectedSlotRepository";
import type { Tasker } from "@calcom/features/tasker/tasker";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import { CreationSource } from "@calcom/prisma/enums";
import type { AvailableSlotsService } from "@calcom/trpc/server/routers/viewer/slots/util";
import { uuid } from "short-uuid";

const FEATURE_FLAG = "slot-waitlist";
const DEFAULT_OFFER_TTL_MINUTES = 30;
const DEFAULT_WAITLIST_MAX_SIZE = 20;
const WAITLIST_SWEEP_BATCH_SIZE = 100;
const BOOKING_RESPONSE_RESERVED_KEYS: readonly string[] = ["eventTypeId", "start", "end"];
const SLOT_UNAVAILABLE_ERROR_CODES: Set<string> = new Set([
  ErrorCode.BookingConflict,
  ErrorCode.NoAvailableUsersFound,
]);

type WaitlistEventType = {
  id: number;
  title: string;
  teamId: number | null;
  schedulingType: string | null;
  seatsPerTimeSlot: number | null;
  recurringEvent: unknown;
  waitlistEnabled: boolean;
  waitlistMaxSize: number | null;
};

type EventTypeRepository = {
  findByIdMinimal(args: { id: number }): Promise<WaitlistEventType | null>;
};

type WaitlistAttendee = {
  name: string;
  email: string;
  timeZone: string;
};

type WaitlistServiceDependencies = {
  waitlistEntryRepository: IWaitlistEntryRepository;
  selectedSlotRepository: ISelectedSlotRepository;
  eventTypeRepository: EventTypeRepository;
  availableSlotsService: Pick<AvailableSlotsService, "getAvailableSlots">;
  featureRepository: Pick<IFeatureRepository, "checkIfFeatureIsEnabledGlobally">;
  tasker: Tasker;
  regularBookingService: Pick<RegularBookingService, "createBooking">;
  now?: () => Date;
  offerTtlMinutes?: number;
};

export type WaitlistClaimResult = {
  entry: WaitlistEntryRecord;
  booking: {
    id: number | null;
    uid: string | null;
  };
};

function newOfferToken(): string {
  return randomBytes(32).toString("base64url");
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecurringEvent(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

function isSlotUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (typeof error === "object" && "code" in error && typeof error.code === "string") {
    return SLOT_UNAVAILABLE_ERROR_CODES.has(error.code);
  }
  return SLOT_UNAVAILABLE_ERROR_CODES.has(error.message);
}

export class WaitlistService {
  private readonly now: () => Date;
  private readonly offerTtlMinutes: number;
  private readonly log = logger.getSubLogger({ prefix: ["WaitlistService"] });

  constructor(private readonly deps: WaitlistServiceDependencies) {
    this.now = deps.now ?? (() => new Date());
    this.offerTtlMinutes = deps.offerTtlMinutes ?? DEFAULT_OFFER_TTL_MINUTES;
  }

  private async sendBestEffortNotification(name: string, send: () => Promise<unknown>): Promise<void> {
    try {
      await send();
    } catch (error) {
      this.log.error(`Failed to send waitlist ${name} email`, safeStringify(error));
    }
  }

  private async ensureFeatureEnabled() {
    if (!(await this.deps.featureRepository.checkIfFeatureIsEnabledGlobally(FEATURE_FLAG))) {
      throw ErrorWithCode.Factory.Forbidden("The slot waitlist is not enabled");
    }
  }

  private async getEventType(eventTypeId: number) {
    const eventType = await this.deps.eventTypeRepository.findByIdMinimal({ id: eventTypeId });
    if (!eventType) {
      throw ErrorWithCode.Factory.EventTypeNotFound("Event type not found");
    }
    return eventType;
  }

  private async isSlotAvailable({
    eventTypeId,
    startTime,
    endTime,
    timeZone,
    isTeamEvent,
  }: {
    eventTypeId: number;
    startTime: Date;
    endTime: Date;
    timeZone: string;
    isTeamEvent: boolean;
  }): Promise<boolean> {
    const schedule = await this.deps.availableSlotsService.getAvailableSlots({
      input: {
        eventTypeId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        timeZone,
        isTeamEvent,
      },
    });

    return Object.values(schedule.slots).some((slots) =>
      slots.some((slot) => new Date(slot.time).getTime() === startTime.getTime())
    );
  }

  async join({
    eventTypeId,
    startTime,
    endTime,
    attendee,
    responses,
  }: {
    eventTypeId: number;
    startTime: Date;
    endTime: Date;
    attendee: WaitlistAttendee;
    responses?: WaitlistEntryJson | null;
  }): Promise<WaitlistEntryRecord> {
    await this.ensureFeatureEnabled();
    const eventType = await this.getEventType(eventTypeId);
    const existing = await this.deps.waitlistEntryRepository.findBySlotAndEmail({
      eventTypeId,
      startTime,
      attendeeEmail: attendee.email,
    });
    if (existing) {
      return existing;
    }

    const now = this.now();
    if (startTime <= now) {
      throw ErrorWithCode.Factory.BadRequest("Cannot join a waitlist for a slot in the past");
    }
    if (!eventType.waitlistEnabled) {
      throw ErrorWithCode.Factory.Forbidden("The waitlist is not enabled for this event type");
    }
    if (eventType.seatsPerTimeSlot !== null) {
      throw ErrorWithCode.Factory.BadRequest("Seated event types cannot use a slot waitlist");
    }
    if (isRecurringEvent(eventType.recurringEvent)) {
      throw ErrorWithCode.Factory.BadRequest("Recurring event types cannot use a slot waitlist");
    }
    if (
      await this.isSlotAvailable({
        eventTypeId,
        startTime,
        endTime,
        timeZone: attendee.timeZone,
        isTeamEvent: eventType.teamId !== null || eventType.schedulingType === "MANAGED",
      })
    ) {
      throw ErrorWithCode.Factory.BadRequest("This slot is available to book");
    }

    const activeCount = await this.deps.waitlistEntryRepository.countActiveForSlot({
      eventTypeId,
      startTime,
    });
    const maxSize = eventType.waitlistMaxSize ?? DEFAULT_WAITLIST_MAX_SIZE;
    if (activeCount >= maxSize) {
      throw ErrorWithCode.Factory.BadRequest("The waitlist is full");
    }

    const data: WaitlistEntryCreateData = {
      uid: uuid(),
      eventTypeId,
      startTime,
      endTime,
      attendeeName: attendee.name,
      attendeeEmail: attendee.email,
      attendeeTimeZone: attendee.timeZone,
      responses,
      status: "PENDING",
    };

    try {
      const created = await this.deps.waitlistEntryRepository.create(data);
      await this.sendBestEffortNotification("joined", () =>
        sendWaitlistJoinedEmail({
          uid: created.uid,
          attendeeName: created.attendeeName,
          attendeeEmail: created.attendeeEmail,
          attendeeTimeZone: created.attendeeTimeZone,
          eventTitle: eventType.title,
          startTime: created.startTime,
          endTime: created.endTime,
        })
      );
      return created;
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      const duplicate = await this.deps.waitlistEntryRepository.findBySlotAndEmail({
        eventTypeId,
        startTime,
        attendeeEmail: attendee.email,
      });
      if (duplicate) {
        return duplicate;
      }
      throw error;
    }
  }

  async offerNextForSlot({
    eventTypeId,
    startTime,
    endTime,
  }: {
    eventTypeId: number;
    startTime: Date;
    endTime?: Date;
  }): Promise<WaitlistEntryRecord | null> {
    if (!(await this.deps.featureRepository.checkIfFeatureIsEnabledGlobally(FEATURE_FLAG))) {
      return null;
    }
    const eventType = await this.getEventType(eventTypeId);
    const now = this.now();
    if (
      startTime <= now ||
      !eventType.waitlistEnabled ||
      eventType.seatsPerTimeSlot !== null ||
      isRecurringEvent(eventType.recurringEvent)
    ) {
      return null;
    }

    const pending = await this.deps.waitlistEntryRepository.findNextPendingForSlot({
      eventTypeId,
      startTime,
    });
    if (!pending) {
      return null;
    }
    const slotEndTime = endTime ?? pending.endTime;
    if (
      !(await this.isSlotAvailable({
        eventTypeId,
        startTime,
        endTime: slotEndTime,
        timeZone: pending.attendeeTimeZone,
        isTeamEvent: eventType.teamId !== null || eventType.schedulingType === "MANAGED",
      }))
    ) {
      return null;
    }

    const offerExpiresAt = new Date(
      now.getTime() +
        Math.min(this.offerTtlMinutes * 60_000, Math.max(0, startTime.getTime() - now.getTime()))
    );
    if (offerExpiresAt <= now) {
      return null;
    }

    // These repositories cannot share a transaction, so reserve first and conditionally transition
    // with cleanup; the partial unique index still enforces one active offer per slot.
    const reserved = await this.deps.selectedSlotRepository.reserveForWaitlist({
      eventTypeId,
      slot: {
        utcStartIso: startTime.toISOString(),
        utcEndIso: slotEndTime.toISOString(),
      },
      uid: pending.uid,
      releaseAt: offerExpiresAt,
    });
    if (!reserved) {
      return null;
    }

    const offerToken = newOfferToken();
    try {
      const transition = await this.deps.waitlistEntryRepository.transitionStatus({
        id: pending.id,
        expectedStatus: "PENDING",
        data: {
          status: "OFFERED",
          offerToken,
          offeredAt: now,
          offerExpiresAt,
        },
      });
      if (transition.count === 0) {
        await this.deps.selectedSlotRepository.releaseForWaitlist({
          eventTypeId,
          slot: {
            utcStartIso: startTime.toISOString(),
            utcEndIso: slotEndTime.toISOString(),
          },
          uid: pending.uid,
        });
        return null;
      }

      await this.deps.tasker.create(
        "expireWaitlistOffer",
        { entryId: pending.id },
        { scheduledAt: offerExpiresAt, referenceUid: pending.uid }
      );
      await this.sendBestEffortNotification("offer", () =>
        sendWaitlistOfferEmail({
          uid: pending.uid,
          attendeeName: pending.attendeeName,
          attendeeEmail: pending.attendeeEmail,
          attendeeTimeZone: pending.attendeeTimeZone,
          eventTitle: eventType.title,
          startTime,
          endTime: slotEndTime,
          offerExpiresAt,
          offerToken,
        })
      );
      return {
        ...pending,
        status: "OFFERED",
        offeredAt: now,
        offerExpiresAt,
      };
    } catch (error) {
      await this.deps.selectedSlotRepository.releaseForWaitlist({
        eventTypeId,
        slot: {
          utcStartIso: startTime.toISOString(),
          utcEndIso: slotEndTime.toISOString(),
        },
        uid: pending.uid,
      });
      if (isUniqueConstraintError(error)) {
        return null;
      }
      throw error;
    }
  }

  async claim({ offerToken }: { offerToken: string }): Promise<WaitlistClaimResult> {
    const entry = await this.deps.waitlistEntryRepository.findByOfferToken(offerToken);
    if (!entry || entry.status !== "OFFERED") {
      throw ErrorWithCode.Factory.NotFound("Waitlist offer not found");
    }
    const now = this.now();
    if (!entry.offerExpiresAt || entry.offerExpiresAt <= now) {
      await this.expireOffer({ entryId: entry.id });
      throw ErrorWithCode.Factory.BadRequest("Waitlist offer has expired");
    }

    const responseData: Record<string, unknown> = isJsonRecord(entry.responses)
      ? Object.fromEntries(
          Object.entries(entry.responses).filter(([key]) => !BOOKING_RESPONSE_RESERVED_KEYS.includes(key))
        )
      : {};
    const bookingData = {
      eventTypeId: entry.eventTypeId,
      start: entry.startTime.toISOString(),
      end: entry.endTime.toISOString(),
      timeZone: entry.attendeeTimeZone,
      language: "en",
      metadata: {},
      creationSource: CreationSource.WEBAPP,
      responses: {
        ...responseData,
        name: entry.attendeeName,
        email: entry.attendeeEmail,
      },
    };

    let booking: Awaited<ReturnType<RegularBookingService["createBooking"]>>;
    try {
      booking = await this.deps.regularBookingService.createBooking({ bookingData });
    } catch (error) {
      await this.expireOffer({
        entryId: entry.id,
        cascade: !isSlotUnavailableError(error),
      });
      throw error;
    }

    const transition = await this.deps.waitlistEntryRepository.transitionStatus({
      id: entry.id,
      expectedStatus: "OFFERED",
      data: {
        status: "CLAIMED",
        offerToken: null,
        claimedBookingId: booking.id,
      },
    });
    if (transition.count === 0) {
      throw ErrorWithCode.Factory.BadRequest("Waitlist offer is no longer available");
    }
    return {
      entry: {
        ...entry,
        status: "CLAIMED",
        offerExpiresAt: null,
        claimedBookingId: booking.id ?? null,
      },
      booking: {
        id: booking.id ?? null,
        uid: booking.uid ?? null,
      },
    };
  }

  async expireOffer({ entryId, cascade = true }: { entryId: number; cascade?: boolean }) {
    const entry = await this.deps.waitlistEntryRepository.findById(entryId);
    if (!entry) {
      return;
    }
    const transition = await this.deps.waitlistEntryRepository.transitionStatus({
      id: entry.id,
      expectedStatus: "OFFERED",
      data: { status: "EXPIRED", offerToken: null },
    });
    if (transition.count === 0) {
      return;
    }

    await this.deps.selectedSlotRepository.releaseForWaitlist({
      eventTypeId: entry.eventTypeId,
      slot: {
        utcStartIso: entry.startTime.toISOString(),
        utcEndIso: entry.endTime.toISOString(),
      },
      uid: entry.uid,
    });
    if (cascade) {
      await this.offerNextForSlot({
        eventTypeId: entry.eventTypeId,
        startTime: entry.startTime,
        endTime: entry.endTime,
      });
    }
    const eventType = await this.getEventType(entry.eventTypeId);
    await this.sendBestEffortNotification("offer expired", () =>
      sendWaitlistOfferExpiredEmail({
        uid: entry.uid,
        attendeeName: entry.attendeeName,
        attendeeEmail: entry.attendeeEmail,
        attendeeTimeZone: entry.attendeeTimeZone,
        eventTitle: eventType.title,
        startTime: entry.startTime,
        endTime: entry.endTime,
      })
    );
  }

  async sweep() {
    if (!(await this.deps.featureRepository.checkIfFeatureIsEnabledGlobally(FEATURE_FLAG))) {
      return;
    }
    const now = this.now();
    await this.deps.waitlistEntryRepository.expireStaleOffers({ now });
    const pastEntries = await this.deps.waitlistEntryRepository.listActiveBefore({
      now,
      limit: WAITLIST_SWEEP_BATCH_SIZE,
    });
    const eventTypes = new Map<number, Promise<WaitlistEventType>>();
    const getSweepEventType = (eventTypeId: number) => {
      let eventType = eventTypes.get(eventTypeId);
      if (!eventType) {
        eventType = this.getEventType(eventTypeId);
        eventTypes.set(eventTypeId, eventType);
      }
      return eventType;
    };
    await Promise.all(
      pastEntries.map(async (entry) => {
        const transition = await this.deps.waitlistEntryRepository.transitionStatus({
          id: entry.id,
          expectedStatus: entry.status,
          data: { status: "CANCELLED", offerToken: null },
        });
        if (transition.count === 0) return;
        if (entry.status === "OFFERED") {
          await this.deps.selectedSlotRepository.releaseForWaitlist({
            eventTypeId: entry.eventTypeId,
            slot: {
              utcStartIso: entry.startTime.toISOString(),
              utcEndIso: entry.endTime.toISOString(),
            },
            uid: entry.uid,
          });
        }
        const eventType = await getSweepEventType(entry.eventTypeId);
        await this.sendBestEffortNotification("cancelled", () =>
          sendWaitlistCancelledEmail({
            uid: entry.uid,
            attendeeName: entry.attendeeName,
            attendeeEmail: entry.attendeeEmail,
            attendeeTimeZone: entry.attendeeTimeZone,
            eventTitle: eventType.title,
            startTime: entry.startTime,
            endTime: entry.endTime,
          })
        );
      })
    );
  }

  async leave({ uid, token }: { uid?: string; token?: string }) {
    const entry = token
      ? await this.deps.waitlistEntryRepository.findByOfferToken(token)
      : uid
        ? await this.deps.waitlistEntryRepository.findByUid(uid)
        : null;
    if (!entry) {
      throw ErrorWithCode.Factory.NotFound("Waitlist entry not found");
    }

    const transition = await this.deps.waitlistEntryRepository.transitionStatus({
      id: entry.id,
      expectedStatus: entry.status,
      data: { status: "CANCELLED", offerToken: null },
    });
    if (transition.count === 0) {
      return entry;
    }

    if (entry.status === "OFFERED") {
      await this.deps.selectedSlotRepository.releaseForWaitlist({
        eventTypeId: entry.eventTypeId,
        slot: {
          utcStartIso: entry.startTime.toISOString(),
          utcEndIso: entry.endTime.toISOString(),
        },
        uid: entry.uid,
      });
      await this.offerNextForSlot({
        eventTypeId: entry.eventTypeId,
        startTime: entry.startTime,
        endTime: entry.endTime,
      });
    }

    return { ...entry, status: "CANCELLED" as const, offerExpiresAt: null };
  }

  async listForEventType({
    eventTypeId,
    status,
  }: {
    eventTypeId: number;
    status?: WaitlistEntryRecord["status"];
  }): Promise<WaitlistEntryRecord[]> {
    return this.deps.waitlistEntryRepository.listForEventType({ eventTypeId, status });
  }

  async remove({ eventTypeId, uid }: { eventTypeId: number; uid: string }) {
    const entry = await this.deps.waitlistEntryRepository.findByUid(uid);
    if (!entry || entry.eventTypeId !== eventTypeId) {
      throw ErrorWithCode.Factory.NotFound("Waitlist entry not found");
    }

    return this.leave({ uid });
  }
}
