import { describe, expect, it } from "vitest";
import { getDefinedBufferTimes } from "./getDefinedBufferTimes";

describe("getDefinedBufferTimes", () => {
  it("returns the supported buffer durations in ascending order", () => {
    expect(getDefinedBufferTimes()).toEqual([5, 10, 15, 20, 30, 45, 60, 90, 120]);
  });

  it("returns a fresh array on every call so callers cannot mutate shared state", () => {
    const first = getDefinedBufferTimes();
    first.push(999);
    expect(getDefinedBufferTimes()).not.toContain(999);
  });
});
