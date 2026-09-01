import type { ReadonlyURLSearchParams } from "next/navigation";
import { describe, expect, it } from "vitest";

import { getUtmTrackingParameters } from "../getUtmTrackingParameters";

const toSearchParams = (query: string): ReadonlyURLSearchParams =>
  new URLSearchParams(query) as unknown as ReadonlyURLSearchParams;

describe("getUtmTrackingParameters", () => {
  it("should return undefined when search params are null", () => {
    expect(getUtmTrackingParameters(null)).toBeUndefined();
  });

  it("should return undefined when no utm parameter is present", () => {
    expect(getUtmTrackingParameters(toSearchParams("foo=bar&month=2024-01"))).toBeUndefined();
  });

  it("should return all utm keys when a single utm parameter is present", () => {
    expect(getUtmTrackingParameters(toSearchParams("utm_source=newsletter"))).toEqual({
      utm_source: "newsletter",
      utm_medium: undefined,
      utm_campaign: undefined,
      utm_term: undefined,
      utm_content: undefined,
    });
  });

  it("should map every supported utm parameter", () => {
    const params = toSearchParams(
      "utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_term=shoes&utm_content=banner&other=1"
    );

    expect(getUtmTrackingParameters(params)).toEqual({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "spring",
      utm_term: "shoes",
      utm_content: "banner",
    });
  });

  it("should keep empty string values since they are present in the url", () => {
    expect(getUtmTrackingParameters(toSearchParams("utm_medium="))?.utm_medium).toBe("");
  });

  it("should use the first value when a utm parameter is repeated", () => {
    expect(getUtmTrackingParameters(toSearchParams("utm_source=a&utm_source=b"))?.utm_source).toBe("a");
  });
});
