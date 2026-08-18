import dayjs from "@calcom/dayjs";
import { getWaitlistService } from "@calcom/features/bookings/di/WaitlistService.container";
import { expect } from "@playwright/test";
import { test } from "./lib/fixtures";

test.describe("slot waitlist", () => {
  test.afterEach(async ({ users }) => {
    await users.deleteAll();
  });

  test("joins an unavailable slot and claims the released offer", async ({
    page,
    users,
    bookings,
    prisma,
    features,
  }) => {
    await features.set("slot-waitlist", true);
    const user = await users.create({
      name: "Waitlist host",
      overrideDefaultEventTypes: true,
      eventTypes: [
        {
          title: "Waitlist meeting",
          slug: "waitlist-meeting",
          length: 30,
          waitlistEnabled: true,
        },
      ],
    });
    const eventType = user.eventTypes[0];

    await page.goto(`/${user.username}/${eventType.slug}`);
    await page.getByTestId("incrementMonth").waitFor();
    await page.locator('[data-testid="day"][data-disabled="false"]').first().click();
    const slot = await page.locator('[data-testid="time"]').first().getAttribute("data-time");
    expect(slot).toBeTruthy();
    if (!slot) throw new Error("Expected an available slot");
    const startTime = new Date(slot);
    const endTime = dayjs(startTime).add(eventType.length, "minute").toDate();
    const occupiedBooking = await bookings.create(
      user.id,
      user.username,
      eventType.id,
      {},
      startTime,
      endTime
    );

    await page.goto(`/${user.username}/${eventType.slug}?slot=${encodeURIComponent(slot)}`);
    await page.locator('[name="name"]').fill("Waitlist attendee");
    await page.locator('[name="email"]').fill("waitlist-attendee@example.com");
    await page.getByRole("button", { name: "Join the waitlist" }).click();
    await expect(page.getByText("You're on the waitlist")).toBeVisible();

    const entry = await prisma.waitlistEntry.findFirstOrThrow({
      where: { eventTypeId: eventType.id, attendeeEmail: "waitlist-attendee@example.com" },
    });
    await occupiedBooking.delete();
    await getWaitlistService().offerNextForSlot({
      eventTypeId: eventType.id,
      startTime,
      endTime,
    });

    const offeredEntry = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } });
    const claimParams = new URLSearchParams({
      eventTitle: eventType.title,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      attendeeTimeZone: "UTC",
      offerExpiresAt: offeredEntry.offerExpiresAt?.toISOString() ?? "",
    });
    await page.goto(`/waitlist/${offeredEntry.offerToken}?${claimParams.toString()}`);
    await page.getByRole("button", { name: "Confirm and book" }).click();
    await page.waitForURL(/\/booking-successful\//);

    const bookingUid = new URL(page.url()).pathname.split("/").at(-1);
    expect(bookingUid).toBeTruthy();
    await expect
      .poll(() => prisma.booking.findUnique({ where: { uid: bookingUid } }))
      .resolves.toMatchObject({ eventTypeId: eventType.id });
  });
});
