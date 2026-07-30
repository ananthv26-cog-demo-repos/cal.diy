import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CAL_API_VERSION_HEADER, X_CAL_CLIENT_ID, X_CAL_PLATFORM_EMBED } from "@calcom/platform-constants";

import http from "../http";

const resetHeaders = (): void => {
  const common = http.instance.defaults.headers.common;
  delete common.Authorization;
  delete common[X_CAL_CLIENT_ID];
  delete common[X_CAL_PLATFORM_EMBED];
  delete common[CAL_API_VERSION_HEADER];
  http.instance.defaults.baseURL = undefined;
  http.setRefreshUrl("");
};

describe("http", () => {
  beforeEach(resetHeaders);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return empty strings for headers that were never set", () => {
    expect(http.getAuthorizationHeader()).toBe("");
    expect(http.getClientIdHeader()).toBe("");
    expect(http.getPlatformEmbedHeader()).toBe("");
  });

  it("should store the bearer token in the authorization header", () => {
    http.setAuthorizationHeader("token-123");

    expect(http.getAuthorizationHeader()).toBe("Bearer token-123");
  });

  it("should store the client id header", () => {
    http.setClientIdHeader("client-abc");

    expect(http.getClientIdHeader()).toBe("client-abc");
    expect(http.instance.defaults.headers.common[X_CAL_CLIENT_ID]).toBe("client-abc");
  });

  it("should stringify the platform embed header", () => {
    http.setPlatformEmbedHeader(false);
    expect(http.getPlatformEmbedHeader()).toBe("false");

    http.setPlatformEmbedHeader(true);
    expect(http.getPlatformEmbedHeader()).toBe("true");
  });

  it("should store the api version header", () => {
    http.setVersionHeader("2024-06-14");

    expect(http.instance.defaults.headers.common[CAL_API_VERSION_HEADER]).toBe("2024-06-14");
  });

  it("should read the api version header in getVersionHeader independent of the client id header", () => {
    http.setVersionHeader("2024-06-14");
    http.setClientIdHeader("client-abc");

    expect(http.getVersionHeader()).toBe("2024-06-14");
  });

  it("should store the base url and the refresh url", () => {
    http.setUrl("https://api.cal.com/v2");
    http.setRefreshUrl("https://example.com/refresh");

    expect(http.getUrl()).toBe("https://api.cal.com/v2");
    expect(http.getRefreshUrl()).toBe("https://example.com/refresh");
  });

  describe("refreshTokens", () => {
    it("should send the current authorization header and store the new access token", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ accessToken: "new-token" }) });
      vi.stubGlobal("fetch", fetchMock);
      http.setAuthorizationHeader("old-token");

      const accessToken = await http.refreshTokens("https://example.com/refresh");

      expect(accessToken).toBe("new-token");
      expect(http.getAuthorizationHeader()).toBe("Bearer new-token");
      expect(fetchMock).toHaveBeenCalledWith("https://example.com/refresh", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer old-token",
        },
      });
    });

    it("should return an empty string and keep the old token when no access token comes back", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ error: "invalid" }) }));
      http.setAuthorizationHeader("old-token");

      expect(await http.refreshTokens("https://example.com/refresh")).toBe("");
      expect(http.getAuthorizationHeader()).toBe("Bearer old-token");
    });

    it("should propagate network errors", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

      await expect(http.refreshTokens("https://example.com/refresh")).rejects.toThrow("network down");
    });
  });
});
