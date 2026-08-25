import { APP_NAME } from "@calcom/lib/constants";
import { buildCalendarEvent } from "@calcom/lib/test/builder";
import { test } from "@calcom/testing/lib/fixtures/fixtures";
import { describe, expect } from "vitest";
import getICalUID from "./getICalUID";

describe("getICalUid", () => {
  test("returns iCalUID when passing a uid", () => {
    const iCalUID = getICalUID({ uid: "123" });
    expect(iCalUID).toEqual(`123@${APP_NAME}`);
  });
  test("returns iCalUID when passing an event", () => {
    const event = buildCalendarEvent({ iCalUID: `123@${APP_NAME}` });
    const iCalUID = getICalUID({ event });
    expect(iCalUID).toEqual(`123@${APP_NAME}`);
  });
  test("returns new iCalUID when passing in an event with no iCalUID but has an uid", () => {
    const event = buildCalendarEvent({ iCalUID: "" });
    const iCalUID = getICalUID({ event, defaultToEventUid: true });
    expect(iCalUID).toEqual(`${event.uid}@${APP_NAME}`);
  });
  test("returns new iCalUID when passing in an event with no iCalUID and uses uid passed", () => {
    const event = buildCalendarEvent({ iCalUID: "" });
    const iCalUID = getICalUID({ event, uid: "123" });
    expect(iCalUID).toEqual(`123@${APP_NAME}`);
  });
});

describe("getICalUid generated ids", () => {
  test("generates a short uuid when neither event nor uid is provided", () => {
    const iCalUID = getICalUID({});

    expect(iCalUID.endsWith(`@${APP_NAME}`)).toBe(true);
    expect(iCalUID.replace(`@${APP_NAME}`, "").length).toBeGreaterThan(0);
  });

  test("appends the attendeeId to a generated uid", () => {
    const iCalUID = getICalUID({ attendeeId: 42 });

    expect(iCalUID).toEqual(expect.stringMatching(new RegExp(`42@${APP_NAME}$`)));
  });

  test("generates a different uid on every call", () => {
    expect(getICalUID({})).not.toEqual(getICalUID({}));
  });

  test("ignores defaultToEventUid when the event has no uid", () => {
    const iCalUID = getICalUID({ event: { iCalUID: "", uid: null }, defaultToEventUid: true, uid: "abc" });

    expect(iCalUID).toEqual(`abc@${APP_NAME}`);
  });
});
