import { BookingEventHandlerService as BaseBookingEventHandlerService } from "@calcom/platform-libraries/bookings";
import { Injectable } from "@nestjs/common";
import { HashedLinkService } from "./hashed-link.service";
import { TaskerService } from "./tasker.service";
import { Logger } from "@/lib/logger.bridge";
import { PrismaEventTypeRepository } from "@/lib/repositories/prisma-event-type.repository";
import { PrismaFeaturesRepository } from "@/lib/repositories/prisma-features.repository";

@Injectable()
export class BookingEventHandlerService extends BaseBookingEventHandlerService {
  constructor(
    hashedLinkService: HashedLinkService,
    bridgeLogger: Logger,
    featureRepository: PrismaFeaturesRepository,
    eventTypeRepository: PrismaEventTypeRepository,
    taskerService: TaskerService
  ) {
    super({
      log: bridgeLogger,
      hashedLinkService,
      featureRepository,
      eventTypeRepository,
      tasker: taskerService.getTasker(),
    });
  }
}
