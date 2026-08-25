import type { TFunction } from "i18next";
import { describe, expect, it, vi } from "vitest";
import { getEventName } from "./eventNaming";

const t = vi.fn((key: string) => key) as unknown as TFunction;

const base = {
  eventType: "Consultation",
  host: "Hosty Host",
  eventDuration: 30,
  t,
};

describe("getEventName with booking field variables", () => {
  it("falls back to Nameless when the attendee name is missing", () => {
    const result = getEventName({
      ...base,
      attendeeName: undefined as unknown as string,
      eventName: "{Scheduler} meeting",
    });

    expect(result).toBe("Nameless meeting");
  });

  it("substitutes the scheduler last name from the name booking field", () => {
    const result = getEventName({
      ...base,
      attendeeName: { firstName: "Ada", lastName: "Lovelace" },
      eventName: "{Scheduler first name} {Scheduler last name}",
      bookingFields: { name: { firstName: "Ada", lastName: "Lovelace" } },
    });

    expect(result).toBe("Ada Lovelace");
  });

  it("ignores the scheduler last name variable when the name field is a plain string", () => {
    const result = getEventName({
      ...base,
      attendeeName: "Ada",
      eventName: "with {Scheduler last name}",
      bookingFields: { name: "Ada" },
    });

    expect(result).toBe("with ");
  });

  it("substitutes a scalar booking field value", () => {
    const result = getEventName({
      ...base,
      attendeeName: "Ada",
      eventName: "{company} sync",
      bookingFields: { company: "Analytical Engines" },
    });

    expect(result).toBe("Analytical Engines sync");
  });

  it("substitutes the value of an option shaped booking field", () => {
    const result = getEventName({
      ...base,
      attendeeName: "Ada",
      eventName: "{plan} sync",
      bookingFields: { plan: { value: "enterprise", label: "Enterprise" } },
    });

    expect(result).toBe("enterprise sync");
  });

  it("resolves a location booking field to its human readable label", () => {
    const result = getEventName({
      ...base,
      attendeeName: "Ada",
      eventName: "call via {location}",
      bookingFields: { location: { value: "integrations:daily" } },
    });

    expect(result).toBe("call via Cal Video");
  });

  it("keeps the raw location value when it is not a known location type", () => {
    const result = getEventName({
      ...base,
      attendeeName: "Ada",
      eventName: "call via {location}",
      bookingFields: { location: { value: "somewhere" } },
    });

    expect(result).toBe("call via somewhere");
  });

  it("joins the first and last name of an object shaped name booking field", () => {
    const result = getEventName({
      ...base,
      attendeeName: "Ada",
      eventName: "{name} sync",
      bookingFields: { name: { firstName: "Ada", lastName: "Lovelace" } },
    });

    expect(result).toBe("Ada Lovelace sync");
  });

  it("uses only the first name when the name booking field has no last name", () => {
    const result = getEventName({
      ...base,
      attendeeName: "Ada",
      eventName: "{name} sync",
      bookingFields: { name: { firstName: "Ada" } },
    });

    expect(result).toBe("Ada sync");
  });

  it("drops variables whose booking field is empty", () => {
    const result = getEventName({
      ...base,
      attendeeName: "Ada",
      eventName: "{notes} sync",
      bookingFields: { notes: "" },
    });

    expect(result).toBe(" sync");
  });

  it("drops variables that have no matching booking field", () => {
    const result = getEventName({
      ...base,
      attendeeName: "Ada",
      eventName: "{unknown} sync",
      bookingFields: { other: "value" },
    });

    expect(result).toBe(" sync");
  });

  it("leaves variables untouched when the event type has no booking fields", () => {
    const result = getEventName({
      ...base,
      attendeeName: "Ada",
      eventName: "{unknown} sync",
    });

    expect(result).toBe("{unknown} sync");
  });

  it("drops an object booking field that has neither a value nor a first name", () => {
    const result = getEventName({
      ...base,
      attendeeName: "Ada",
      eventName: "{extra} sync",
      bookingFields: { extra: { somethingElse: true } },
    });

    expect(result).toBe(" sync");
  });
});
