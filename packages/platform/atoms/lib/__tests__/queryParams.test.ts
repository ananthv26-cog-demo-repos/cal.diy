import { beforeEach, describe, expect, it, vi } from "vitest";

import getQueryParam from "../getQueryParam";
import setQueryParam from "../setQueryParam";

const setLocation = (url: string): void => {
  window.history.replaceState({}, "", url);
};

describe("getQueryParam", () => {
  beforeEach(() => {
    setLocation("/booking?month=2024-01&empty=");
  });

  it("should return the value of an existing param", () => {
    expect(getQueryParam("month")).toBe("2024-01");
  });

  it("should return an empty string for a param present without a value", () => {
    expect(getQueryParam("empty")).toBe("");
  });

  it("should return null for a missing param", () => {
    expect(getQueryParam("missing")).toBeNull();
  });
});

describe("setQueryParam", () => {
  beforeEach(() => {
    setLocation("/booking?month=2024-01");
  });

  it("should add a new param while keeping existing ones", () => {
    setQueryParam("date", "2024-01-15");

    expect(getQueryParam("month")).toBe("2024-01");
    expect(getQueryParam("date")).toBe("2024-01-15");
  });

  it("should overwrite an existing param", () => {
    setQueryParam("month", "2024-02");

    expect(new URL(window.location.href).searchParams.getAll("month")).toEqual(["2024-02"]);
  });

  it("should url-encode the param value", () => {
    setQueryParam("name", "a b&c");

    expect(window.location.search).toContain("name=a+b%26c");
    expect(getQueryParam("name")).toBe("a b&c");
  });

  it("should call onParamChange after updating the url", () => {
    const onParamChange = vi.fn(() => {
      expect(getQueryParam("date")).toBe("2024-01-15");
    });

    setQueryParam("date", "2024-01-15", onParamChange);

    expect(onParamChange).toHaveBeenCalledTimes(1);
  });

  it("should not throw when no callback is passed", () => {
    expect(() => setQueryParam("date", "2024-01-15")).not.toThrow();
  });
});
