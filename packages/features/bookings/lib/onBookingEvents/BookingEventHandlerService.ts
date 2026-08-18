import type { ISimpleLogger } from "@calcom/features/di/shared/services/logger.service";
import type { EventTypeRepository } from "@calcom/features/eventtypes/repositories/eventTypeRepository";
import type { IFeatureRepository } from "@calcom/features/flags/repositories/PrismaFeatureRepository";
import type { HashedLinkService } from "@calcom/features/hashedLink/lib/service/HashedLinkService";
import type { Tasker } from "@calcom/features/tasker/tasker";
import { safeStringify } from "@calcom/lib/safeStringify";
import type { BookingCreatedPayload, BookingRescheduledPayload, BookingSlotFreedPayload } from "./types";

interface BookingEventHandlerDeps {
  log: ISimpleLogger;
  hashedLinkService: HashedLinkService;
  featureRepository: Pick<IFeatureRepository, "checkIfFeatureIsEnabledGlobally">;
  eventTypeRepository: Pick<EventTypeRepository, "findByIdMinimal">;
  tasker: Tasker;
}

interface OnBookingCreatedParams {
  payload: BookingCreatedPayload;
}

interface OnBookingRescheduledParams {
  payload: BookingRescheduledPayload;
}

export class BookingEventHandlerService {
  private readonly log: BookingEventHandlerDeps["log"];

  constructor(private readonly deps: BookingEventHandlerDeps) {
    this.log = deps.log;
  }

  async onBookingCreated(params: OnBookingCreatedParams) {
    const { payload } = params;
    this.log.debug("onBookingCreated", safeStringify(payload));
    if (payload.config.isDryRun) {
      return;
    }
    await this.onBookingCreatedOrRescheduled(payload);
  }

  async onBookingRescheduled(params: OnBookingRescheduledParams) {
    const { payload } = params;
    this.log.debug("onBookingRescheduled", safeStringify(payload));
    if (payload.config.isDryRun) {
      return;
    }
    await Promise.all([
      this.onBookingCreatedOrRescheduled(payload),
      this.enqueueWaitlistOffer({
        config: payload.config,
        booking: {
          uid: payload.oldBooking.uid,
          eventTypeId: payload.booking.eventTypeId,
          startTime: payload.oldBooking.startTime,
          endTime: payload.oldBooking.endTime,
        },
      }),
    ]);
  }

  async onBookingCancelled(params: { payload: BookingSlotFreedPayload }) {
    const { payload } = params;
    if (payload.config.isDryRun) return;
    await this.enqueueWaitlistOffer(payload);
  }

  async onBookingDeclined(params: { payload: BookingSlotFreedPayload }) {
    const { payload } = params;
    if (payload.config.isDryRun) return;
    await this.enqueueWaitlistOffer(payload);
  }

  private async onBookingCreatedOrRescheduled(payload: BookingCreatedPayload | BookingRescheduledPayload) {
    const results = await Promise.allSettled([
      this.updatePrivateLinkUsage(payload.bookingFormData.hashedLink),
    ]);
    results.forEach((result) => {
      if (result.status === "rejected") {
        this.log.error(
          "Error while executing onBookingCreatedOrRescheduled task",
          safeStringify(result.reason)
        );
      }
    });
  }

  private async updatePrivateLinkUsage(hashedLink: string | null) {
    try {
      if (hashedLink) {
        await this.deps.hashedLinkService.validateAndIncrementUsage(hashedLink);
      }
    } catch (error) {
      this.log.error("Error while updating hashed link", safeStringify(error));
    }
  }

  private async enqueueWaitlistOffer(payload: BookingSlotFreedPayload) {
    try {
      if (payload.booking.eventTypeId === null) return;
      if (!(await this.deps.featureRepository.checkIfFeatureIsEnabledGlobally("slot-waitlist"))) {
        return;
      }
      const eventType = await this.deps.eventTypeRepository.findByIdMinimal({
        id: payload.booking.eventTypeId,
      });
      if (!eventType?.waitlistEnabled) return;

      await this.deps.tasker.create("offerNextWaitlistEntry", {
        eventTypeId: payload.booking.eventTypeId,
        startTime: payload.booking.startTime.toISOString(),
        endTime: payload.booking.endTime.toISOString(),
      });
    } catch (error) {
      this.log.error("Failed to dispatch waitlist offer", safeStringify(error));
    }
  }
}
