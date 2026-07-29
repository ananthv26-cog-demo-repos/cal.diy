import { ErrorWithCode } from "@calcom/lib/errors";
import type { PrismaClient } from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/enums";
import { BookingRepository } from "../repositories/BookingRepository";
import { BookingAccessService } from "./BookingAccessService";

export type RescheduleEligibility = {
  canReschedule: boolean;
  startTime: Date;
  minimumBookingNotice: number;
};

export class RescheduleEligibilityService {
  private bookingRepo: BookingRepository;
  private bookingAccessService: BookingAccessService;

  constructor(prismaClient: PrismaClient) {
    this.bookingRepo = new BookingRepository(prismaClient);
    this.bookingAccessService = new BookingAccessService(prismaClient);
  }

  async getRescheduleEligibility({
    userId,
    bookingUid,
  }: {
    userId: number;
    bookingUid: string;
  }): Promise<RescheduleEligibility> {
    const hasAccess = await this.bookingAccessService.doesUserIdHaveAccessToBooking({
      userId,
      bookingUid,
    });

    if (!hasAccess) {
      throw ErrorWithCode.Factory.Forbidden("You do not have permission to view this booking");
    }

    const booking = await this.bookingRepo.findByUidForRescheduleEligibility({ bookingUid });

    if (!booking) {
      throw ErrorWithCode.Factory.BookingNotFound("Booking not found");
    }

    const minimumBookingNotice = booking.eventType?.minimumBookingNotice ?? 0;

    const isActive = booking.status === BookingStatus.ACCEPTED || booking.status === BookingStatus.PENDING;

    const earliestReschedule = new Date(Date.now() + minimumBookingNotice * 60 * 1000);
    const canReschedule = isActive && booking.startTime.getTime() > earliestReschedule.getTime();

    return {
      canReschedule,
      startTime: booking.startTime,
      minimumBookingNotice,
    };
  }
}
