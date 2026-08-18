import { Module, Scope } from "@nestjs/common";
import { Logger } from "@/lib/logger.bridge";
import { PrismaEventTypeRepository } from "@/lib/repositories/prisma-event-type.repository";
import { PrismaFeaturesRepository } from "@/lib/repositories/prisma-features.repository";
import { BookingEventHandlerService } from "@/lib/services/booking-event-handler.service";
import { HashedLinkService } from "@/lib/services/hashed-link.service";
import { TaskerService } from "@/lib/services/tasker.service";
import { PrismaWorkerModule } from "@/modules/prisma/prisma-worker.module";

@Module({
  imports: [PrismaWorkerModule],
  providers: [
    {
      provide: Logger,
      useFactory: () => {
        return new Logger();
      },
      scope: Scope.TRANSIENT,
    },
    TaskerService,
    PrismaFeaturesRepository,
    PrismaEventTypeRepository,
    HashedLinkService,
    BookingEventHandlerService,
  ],
  exports: [BookingEventHandlerService],
})
export class BookingEventHandlerModule {}
