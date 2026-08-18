import { MembershipRole } from "@calcom/prisma/enums";
import publicProcedure from "../../../procedures/publicProcedure";
import { router } from "../../../trpc";
import { createEventPbacProcedure } from "../eventTypes/util";
import {
  ZWaitlistClaimInputSchema,
  ZWaitlistJoinInputSchema,
  ZWaitlistLeaveInputSchema,
  ZWaitlistListForEventTypeInputSchema,
  ZWaitlistOfferPreviewInputSchema,
  ZWaitlistRemoveInputSchema,
} from "./waitlist.schema";

export const waitlistRouter = router({
  join: publicProcedure.input(ZWaitlistJoinInputSchema).mutation(async ({ ctx, input }) => {
    const { joinHandler } = await import("./join.handler");
    return joinHandler({ ctx, input });
  }),
  claim: publicProcedure.input(ZWaitlistClaimInputSchema).mutation(async ({ ctx, input }) => {
    const { claimHandler } = await import("./claim.handler");
    return claimHandler({ ctx, input });
  }),
  getOfferPreview: publicProcedure.input(ZWaitlistOfferPreviewInputSchema).query(async ({ ctx, input }) => {
    const { getOfferPreviewHandler } = await import("./getOfferPreview.handler");
    return getOfferPreviewHandler({ ctx, input });
  }),
  leave: publicProcedure.input(ZWaitlistLeaveInputSchema).mutation(async ({ ctx, input }) => {
    const { leaveHandler } = await import("./leave.handler");
    return leaveHandler({ ctx, input });
  }),
  listForEventType: createEventPbacProcedure("eventType.read", [
    MembershipRole.OWNER,
    MembershipRole.ADMIN,
    MembershipRole.MEMBER,
  ])
    .input(ZWaitlistListForEventTypeInputSchema)
    .query(async ({ input }) => {
      const { listForEventTypeHandler } = await import("./listForEventType.handler");
      return listForEventTypeHandler({ input });
    }),
  remove: createEventPbacProcedure("eventType.update", [MembershipRole.OWNER, MembershipRole.ADMIN])
    .input(ZWaitlistRemoveInputSchema)
    .mutation(async ({ input }) => {
      const { removeHandler } = await import("./remove.handler");
      return removeHandler({ input });
    }),
});
