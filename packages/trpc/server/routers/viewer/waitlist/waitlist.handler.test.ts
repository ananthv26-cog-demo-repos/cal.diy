import { ErrorWithCode } from "@calcom/lib/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TRPCContext } from "../../../createContext";
import { createCallerFactory } from "../../../trpc";

const mocks = vi.hoisted(() => ({
  service: {
    join: vi.fn(),
    claim: vi.fn(),
    getOfferPreview: vi.fn(),
    leave: vi.fn(),
    remove: vi.fn(),
    listForEventType: vi.fn(),
  },
  rateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@calcom/features/bookings/di/WaitlistService.container", () => ({
  getWaitlistService: () => mocks.service,
}));
vi.mock("@calcom/lib/checkRateLimitAndThrowError", () => ({
  checkRateLimitAndThrowError: mocks.rateLimit,
}));
vi.mock("@calcom/features/auth/lib/userFromSessionUtils", () => ({
  getUserSession: vi.fn(async (ctx: { user?: unknown; session?: unknown }) => ({
    user: ctx.user,
    session: ctx.session,
  })),
}));

import { waitlistRouter } from "./_router";
import { claimHandler } from "./claim.handler";
import { getOfferPreviewHandler } from "./getOfferPreview.handler";
import { joinHandler } from "./join.handler";
import { leaveHandler } from "./leave.handler";

const entry = {
  id: 1,
  uid: "waitlist-1",
  eventTypeId: 10,
  startTime: new Date("2030-01-01T10:00:00.000Z"),
  endTime: new Date("2030-01-01T11:00:00.000Z"),
  attendeeName: "Attendee",
  attendeeEmail: "attendee@example.com",
  attendeeTimeZone: "UTC",
  responses: null,
  status: "PENDING" as const,
  offeredAt: null,
  offerExpiresAt: null,
  claimedBookingId: null,
  createdAt: new Date("2029-12-01T00:00:00.000Z"),
  updatedAt: new Date("2029-12-01T00:00:00.000Z"),
};

const context = (overrides: Record<string, unknown> = {}) =>
  ({
    sourceIp: "192.0.2.1",
    user: null,
    req: undefined,
    res: undefined,
    ...overrides,
  }) as unknown as TRPCContext;

describe("waitlist tRPC procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(undefined);
  });

  it("joins a waitlist through the public procedure", async () => {
    mocks.service.join.mockResolvedValue(entry);
    const caller = createCallerFactory(waitlistRouter)(context());

    const result = await caller.join({
      eventTypeId: 10,
      startTime: entry.startTime,
      endTime: entry.endTime,
      attendee: {
        name: entry.attendeeName,
        email: entry.attendeeEmail,
        timeZone: entry.attendeeTimeZone,
      },
    });

    expect(result).toEqual({
      id: entry.id,
      uid: entry.uid,
      eventTypeId: entry.eventTypeId,
      startTime: entry.startTime,
      endTime: entry.endTime,
      attendeeName: entry.attendeeName,
      attendeeTimeZone: entry.attendeeTimeZone,
      responses: entry.responses,
      status: entry.status,
      offeredAt: entry.offeredAt,
      offerExpiresAt: entry.offerExpiresAt,
      claimedBookingId: entry.claimedBookingId,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
    expect(result).not.toHaveProperty("attendeeEmail");
    expect(result).not.toHaveProperty("offerToken");
  });

  it("rejects join when the service rejects disabled waitlists", async () => {
    mocks.service.join.mockRejectedValue(ErrorWithCode.Factory.Forbidden("The slot waitlist is not enabled"));

    await expect(
      joinHandler({
        ctx: context(),
        input: {
          eventTypeId: 10,
          startTime: entry.startTime,
          endTime: entry.endTime,
          attendee: {
            name: entry.attendeeName,
            email: entry.attendeeEmail,
            timeZone: entry.attendeeTimeZone,
          },
        },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("claims with a valid token and rejects expired or unknown tokens", async () => {
    mocks.service.claim.mockResolvedValue({
      entry: {
        ...entry,
        status: "CLAIMED",
        claimedBookingId: 42,
      },
      booking: { id: 42, uid: "booking-1" },
    });
    const valid = await claimHandler({
      ctx: context(),
      input: { offerToken: "opaque-offer-token" },
    });
    expect(valid).toMatchObject({
      entry: { status: "CLAIMED", claimedBookingId: 42 },
      booking: { id: 42, uid: "booking-1" },
    });
    expect(valid.entry).not.toHaveProperty("attendeeEmail");
    expect(valid.entry).not.toHaveProperty("offerToken");

    mocks.service.claim.mockRejectedValueOnce(ErrorWithCode.Factory.BadRequest("Waitlist offer has expired"));
    await expect(
      claimHandler({ ctx: context(), input: { offerToken: "expired-token" } })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    mocks.service.claim.mockRejectedValueOnce(ErrorWithCode.Factory.NotFound("Waitlist offer not found"));
    await expect(
      claimHandler({ ctx: context(), input: { offerToken: "unknown-token" } })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("leaves a waitlist entry by its opaque token", async () => {
    mocks.service.leave.mockResolvedValue(entry);

    const result = await leaveHandler({
      ctx: context(),
      input: { token: "opaque-offer-token" },
    });

    expect(mocks.service.leave).toHaveBeenCalledWith({ token: "opaque-offer-token" });
    expect(result).not.toHaveProperty("attendeeEmail");
    expect(result).not.toHaveProperty("offerToken");
  });

  it("returns authoritative offer preview data without exposing credentials", async () => {
    mocks.service.getOfferPreview.mockResolvedValue({
      status: "OFFERED",
      entry: {
        ...entry,
        status: "OFFERED",
        offerExpiresAt: new Date("2029-12-31T12:30:00.000Z"),
      },
      eventTitle: "Authoritative event",
    });

    const result = await getOfferPreviewHandler({
      ctx: context(),
      input: { offerToken: "opaque-offer-token" },
    });

    expect(result).toMatchObject({
      status: "OFFERED",
      eventTitle: "Authoritative event",
      entry: {
        status: "OFFERED",
        offerExpiresAt: new Date("2029-12-31T12:30:00.000Z"),
      },
    });
    expect(result.entry).not.toHaveProperty("attendeeEmail");
    expect(result.entry).not.toHaveProperty("offerToken");

    for (const status of ["NOT_FOUND", "EXPIRED", "CLAIMED", "CANCELLED"] as const) {
      mocks.service.getOfferPreview.mockResolvedValueOnce({
        status,
        entry: null,
        eventTitle: null,
      });
      await expect(
        getOfferPreviewHandler({ ctx: context(), input: { offerToken: `${status}-token` } })
      ).resolves.toMatchObject({ status });
    }
  });

  it("rejects hosts without event-type ownership for listing and removal", async () => {
    const caller = createCallerFactory(waitlistRouter)(
      context({
        user: { id: 2 },
        session: { user: { id: "2" }, upId: "usr-2" },
        prisma: {
          eventType: {
            findUnique: vi.fn().mockResolvedValue({
              id: 10,
              userId: 1,
              teamId: null,
              users: [],
            }),
          },
        },
      })
    );

    await expect(caller.listForEventType({ eventTypeId: 10 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.remove({ eventTypeId: 10, uid: entry.uid })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.service.listForEventType).not.toHaveBeenCalled();
    expect(mocks.service.remove).not.toHaveBeenCalled();
  });
});
