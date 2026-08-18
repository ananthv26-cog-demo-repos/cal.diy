import { createContainer } from "@calcom/features/di/di";
import { type WaitlistService, moduleLoader as waitlistServiceModule } from "./WaitlistService.module";

const waitlistServiceContainer = createContainer();

export function getWaitlistService(): WaitlistService {
  waitlistServiceModule.loadModule(waitlistServiceContainer);
  return waitlistServiceContainer.get<WaitlistService>(waitlistServiceModule.token);
}
