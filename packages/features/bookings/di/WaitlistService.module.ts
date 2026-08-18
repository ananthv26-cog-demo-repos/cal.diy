import { getAvailableSlotsService } from "@calcom/features/di/containers/AvailableSlots";
import { getFeatureRepository } from "@calcom/features/di/containers/FeatureRepository";
import { createModule, type ModuleLoader } from "@calcom/features/di/di";
import { moduleLoader as prismaModuleLoader } from "@calcom/features/di/modules/Prisma";
import { SHARED_TOKENS } from "@calcom/features/di/shared/shared.tokens";
import { DI_TOKENS } from "@calcom/features/di/tokens";
import { EventTypeRepository } from "@calcom/features/eventtypes/repositories/eventTypeRepository";
import { PrismaSelectedSlotRepository } from "@calcom/features/selectedSlots/repositories/PrismaSelectedSlotRepository";
import tasker from "@calcom/features/tasker";
import { WaitlistEntryRepository } from "../repositories/WaitlistEntryRepository";
import { WaitlistService } from "../services/WaitlistService";
import { getRegularBookingService } from "./RegularBookingService.container";

const thisModule = createModule();
const token = DI_TOKENS.WAITLIST_SERVICE;
const moduleToken = DI_TOKENS.WAITLIST_SERVICE_MODULE;

thisModule
  .bind(DI_TOKENS.WAITLIST_ENTRY_REPOSITORY)
  .toClass(WaitlistEntryRepository, [DI_TOKENS.PRISMA_CLIENT]);
thisModule.bind(DI_TOKENS.EVENT_TYPE_REPOSITORY).toClass(EventTypeRepository, [DI_TOKENS.PRISMA_CLIENT]);
thisModule
  .bind(DI_TOKENS.SELECTED_SLOT_REPOSITORY)
  .toClass(PrismaSelectedSlotRepository, [DI_TOKENS.PRISMA_CLIENT]);
thisModule.bind(DI_TOKENS.AVAILABLE_SLOTS_SERVICE).toFactory(() => getAvailableSlotsService());
thisModule.bind(DI_TOKENS.FEATURES_REPOSITORY).toFactory(() => getFeatureRepository());
thisModule.bind(DI_TOKENS.REGULAR_BOOKING_SERVICE).toFactory(() => getRegularBookingService());
thisModule.bind(SHARED_TOKENS.TASKER).toFactory(() => tasker);
thisModule.bind(token).toClass(WaitlistService, {
  waitlistEntryRepository: DI_TOKENS.WAITLIST_ENTRY_REPOSITORY,
  selectedSlotRepository: DI_TOKENS.SELECTED_SLOT_REPOSITORY,
  eventTypeRepository: DI_TOKENS.EVENT_TYPE_REPOSITORY,
  availableSlotsService: DI_TOKENS.AVAILABLE_SLOTS_SERVICE,
  featureRepository: DI_TOKENS.FEATURES_REPOSITORY,
  tasker: SHARED_TOKENS.TASKER,
  regularBookingService: DI_TOKENS.REGULAR_BOOKING_SERVICE,
});

export const moduleLoader: ModuleLoader = {
  token,
  loadModule: (container) => {
    container.load(moduleToken, thisModule);
    prismaModuleLoader.loadModule(container);
  },
};

export type { WaitlistService };
