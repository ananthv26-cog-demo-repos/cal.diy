import { describe, expect, it } from "vitest";

import { filterPropsTimezones, formatTimezones } from "../timeZones";

const availableTimezones: { city: string; timezone: string }[] = [
  { city: "New York", timezone: "America/New_York" },
  { city: "London", timezone: "Europe/London" },
  { city: "Tokyo", timezone: "Asia/Tokyo" },
];

describe("formatTimezones", () => {
  it("should map city to label and keep the timezone", () => {
    expect(formatTimezones(availableTimezones)).toEqual([
      { label: "New York", timezone: "America/New_York" },
      { label: "London", timezone: "Europe/London" },
      { label: "Tokyo", timezone: "Asia/Tokyo" },
    ]);
  });

  it("should drop the city key from the result", () => {
    expect(formatTimezones([availableTimezones[0]])[0]).not.toHaveProperty("city");
  });

  it("should return an empty array for empty input", () => {
    expect(formatTimezones([])).toEqual([]);
  });
});

describe("filterPropsTimezones", () => {
  it("should keep only the available timezones listed in props", () => {
    expect(filterPropsTimezones(["Europe/London", "Asia/Tokyo"], availableTimezones)).toEqual([
      { city: "London", timezone: "Europe/London" },
      { city: "Tokyo", timezone: "Asia/Tokyo" },
    ]);
  });

  it("should ignore props timezones that are not available", () => {
    expect(filterPropsTimezones(["Mars/Olympus", "Europe/London"], availableTimezones)).toEqual([
      { city: "London", timezone: "Europe/London" },
    ]);
  });

  it("should return an empty array when no props timezones are given", () => {
    expect(filterPropsTimezones([], availableTimezones)).toEqual([]);
  });

  it("should match exactly and not partially", () => {
    expect(filterPropsTimezones(["Europe"], availableTimezones)).toEqual([]);
  });

  it("should preserve the order of the available timezones, not of the props", () => {
    expect(
      filterPropsTimezones(["Asia/Tokyo", "America/New_York"], availableTimezones).map((t) => t.timezone)
    ).toEqual(["America/New_York", "Asia/Tokyo"]);
  });
});
