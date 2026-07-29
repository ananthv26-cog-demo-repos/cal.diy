import { SchedulingType } from "@calcom/prisma/enums";
import { describe, expect, it } from "vitest";
import type { TCreateEventTypeInput } from "./schemas";
import { createEventTypeInput, EventTypeDuplicateInput } from "./schemas";

describe("EventTypeDuplicateInput", () => {
  const valid = {
    id: 1,
    slug: "30min-copy",
    title: "30 min copy",
    description: "A copy",
    length: 30,
  };

  it("accepts a minimal valid payload", () => {
    expect(EventTypeDuplicateInput.parse(valid)).toEqual(valid);
  });

  it("accepts a nullable teamId", () => {
    expect(EventTypeDuplicateInput.parse({ ...valid, teamId: null }).teamId).toBeNull();
    expect(EventTypeDuplicateInput.parse({ ...valid, teamId: 7 }).teamId).toBe(7);
  });

  it("rejects an empty title", () => {
    expect(() => EventTypeDuplicateInput.parse({ ...valid, title: "" })).toThrow();
  });

  it("rejects unknown keys because the schema is strict", () => {
    expect(() => EventTypeDuplicateInput.parse({ ...valid, hidden: true })).toThrow();
  });

  it("rejects a missing description", () => {
    const { description: _description, ...withoutDescription } = valid;
    expect(() => EventTypeDuplicateInput.parse(withoutDescription)).toThrow();
  });
});

describe("createEventTypeInput", () => {
  const valid: TCreateEventTypeInput = {
    title: "30 min",
    slug: "30min",
    length: 30,
  };

  it("accepts a minimal payload without hidden or locations", () => {
    const parsed = createEventTypeInput.parse(valid);
    expect(parsed.title).toBe("30 min");
    expect(parsed.slug).toBe("30min");
    expect(parsed.length).toBe(30);
  });

  it("trims the title and rejects a whitespace-only title", () => {
    expect(createEventTypeInput.parse({ ...valid, title: "  30 min  " }).title).toBe("30 min");
    expect(() => createEventTypeInput.parse({ ...valid, title: "   " })).toThrow();
  });

  it("slugifies the slug", () => {
    expect(createEventTypeInput.parse({ ...valid, slug: "My Event!" }).slug).toBe("my-event");
  });

  it("rejects a slug that slugifies to an empty string", () => {
    expect(() => createEventTypeInput.parse({ ...valid, slug: "!!!" })).toThrow();
  });

  it("rejects a non-integer length", () => {
    expect(() => createEventTypeInput.parse({ ...valid, length: 30.5 })).toThrow();
  });

  it("requires a scheduling type for team events", () => {
    expect(() => createEventTypeInput.parse({ ...valid, teamId: 5 })).toThrow(
      /You must select a scheduling type for team events/
    );

    expect(
      createEventTypeInput.parse({ ...valid, teamId: 5, schedulingType: SchedulingType.COLLECTIVE })
        .schedulingType
    ).toBe(SchedulingType.COLLECTIVE);
  });

  it("does not require a scheduling type when teamId is null", () => {
    expect(() => createEventTypeInput.parse({ ...valid, teamId: null })).not.toThrow();
  });

  it("accepts locations and keeps their optional fields", () => {
    const parsed = createEventTypeInput.parse({
      ...valid,
      locations: [{ type: "inPerson", address: "Somewhere", displayLocationPublicly: true }],
    });

    expect(parsed.locations).toEqual([
      { type: "inPerson", address: "Somewhere", displayLocationPublicly: true },
    ]);
  });

  it("rejects a location link that is not a url", () => {
    expect(() =>
      createEventTypeInput.parse({ ...valid, locations: [{ type: "link", link: "not-a-url" }] })
    ).toThrow();
  });

  it("rejects negative buffers and notice values", () => {
    expect(() => createEventTypeInput.parse({ ...valid, beforeEventBuffer: -1 })).toThrow();
    expect(() => createEventTypeInput.parse({ ...valid, afterEventBuffer: -1 })).toThrow();
    expect(() => createEventTypeInput.parse({ ...valid, minimumBookingNotice: -1 })).toThrow();
    expect(() => createEventTypeInput.parse({ ...valid, slotInterval: -1 })).toThrow();
  });

  it("accepts calVideoSettings and validates the exit redirect url", () => {
    expect(
      createEventTypeInput.parse({
        ...valid,
        calVideoSettings: { disableRecordingForGuests: true, redirectUrlOnExit: "https://example.com" },
      }).calVideoSettings
    ).toEqual({ disableRecordingForGuests: true, redirectUrlOnExit: "https://example.com" });

    expect(() =>
      createEventTypeInput.parse({ ...valid, calVideoSettings: { redirectUrlOnExit: "nope" } })
    ).toThrow();
  });

  it("accepts a null calVideoSettings", () => {
    expect(createEventTypeInput.parse({ ...valid, calVideoSettings: null }).calVideoSettings).toBeNull();
  });
});
