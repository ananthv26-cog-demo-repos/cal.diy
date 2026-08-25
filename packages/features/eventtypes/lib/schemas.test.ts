import { SchedulingType } from "@calcom/prisma/enums";
import { describe, expect, it } from "vitest";
import { createEventTypeInput, EventTypeDuplicateInput } from "./schemas";

describe("EventTypeDuplicateInput", () => {
  const valid = {
    id: 1,
    slug: "my-event",
    title: "My event",
    description: "Some description",
    length: 30,
  };

  it("accepts a minimal valid payload", () => {
    expect(EventTypeDuplicateInput.parse(valid)).toEqual(valid);
  });

  it("accepts a nullable teamId", () => {
    expect(EventTypeDuplicateInput.parse({ ...valid, teamId: null })).toMatchObject({ teamId: null });
    expect(EventTypeDuplicateInput.parse({ ...valid, teamId: 5 })).toMatchObject({ teamId: 5 });
  });

  it("rejects an empty title", () => {
    expect(() => EventTypeDuplicateInput.parse({ ...valid, title: "" })).toThrow();
  });

  it("rejects unknown keys because the schema is strict", () => {
    expect(() => EventTypeDuplicateInput.parse({ ...valid, unexpected: true })).toThrow();
  });

  it("rejects a missing description", () => {
    const { description: _description, ...withoutDescription } = valid;
    expect(() => EventTypeDuplicateInput.parse(withoutDescription)).toThrow();
  });
});

describe("createEventTypeInput", () => {
  const valid = {
    title: "My event",
    slug: "my-event",
    length: 30,
  };

  it("accepts a minimal payload without hidden/locations", () => {
    expect(createEventTypeInput.parse(valid)).toMatchObject(valid);
  });

  it("trims the title and rejects a blank one", () => {
    expect(createEventTypeInput.parse({ ...valid, title: "  spaced  " })).toMatchObject({
      title: "spaced",
    });
    expect(() => createEventTypeInput.parse({ ...valid, title: "   " })).toThrow();
  });

  it("rejects a non-integer length", () => {
    expect(() => createEventTypeInput.parse({ ...valid, length: 30.5 })).toThrow();
  });

  it("rejects negative buffers and slot intervals", () => {
    expect(() => createEventTypeInput.parse({ ...valid, beforeEventBuffer: -1 })).toThrow();
    expect(() => createEventTypeInput.parse({ ...valid, afterEventBuffer: -1 })).toThrow();
    expect(() => createEventTypeInput.parse({ ...valid, minimumBookingNotice: -1 })).toThrow();
    expect(() => createEventTypeInput.parse({ ...valid, slotInterval: -1 })).toThrow();
  });

  it("requires a scheduling type when a teamId is provided", () => {
    const result = createEventTypeInput.safeParse({ ...valid, teamId: 3 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["schedulingType"]);
    }
  });

  it("accepts a team event that declares a scheduling type", () => {
    expect(
      createEventTypeInput.parse({
        ...valid,
        teamId: 3,
        schedulingType: SchedulingType.COLLECTIVE,
      })
    ).toMatchObject({ teamId: 3, schedulingType: SchedulingType.COLLECTIVE });
  });

  it("does not require a scheduling type for a personal event", () => {
    expect(createEventTypeInput.safeParse({ ...valid, teamId: null }).success).toBe(true);
  });

  it("validates the calVideoSettings redirect url", () => {
    expect(
      createEventTypeInput.parse({
        ...valid,
        calVideoSettings: { redirectUrlOnExit: "https://cal.com", disableRecordingForGuests: true },
      })
    ).toMatchObject({
      calVideoSettings: { redirectUrlOnExit: "https://cal.com", disableRecordingForGuests: true },
    });

    expect(
      createEventTypeInput.safeParse({ ...valid, calVideoSettings: { redirectUrlOnExit: "not-a-url" } })
        .success
    ).toBe(false);
  });

  it("accepts a null calVideoSettings", () => {
    expect(createEventTypeInput.safeParse({ ...valid, calVideoSettings: null }).success).toBe(true);
  });
});
