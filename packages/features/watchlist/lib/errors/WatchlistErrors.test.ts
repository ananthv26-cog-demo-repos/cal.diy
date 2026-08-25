import { describe, expect, it } from "vitest";
import { WatchlistError, WatchlistErrorCode, WatchlistErrors } from "./WatchlistErrors";

describe("WatchlistError", () => {
  it("is a named Error carrying the code and message", () => {
    const error = new WatchlistError(WatchlistErrorCode.NOT_FOUND, "missing");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("WatchlistError");
    expect(error.code).toBe(WatchlistErrorCode.NOT_FOUND);
    expect(error.message).toBe("missing");
  });
});

describe("WatchlistErrors factories", () => {
  const cases: Array<[keyof typeof WatchlistErrors, WatchlistErrorCode]> = [
    ["notFound", WatchlistErrorCode.NOT_FOUND],
    ["unauthorized", WatchlistErrorCode.UNAUTHORIZED],
    ["alreadyInWatchlist", WatchlistErrorCode.ALREADY_IN_WATCHLIST],
    ["invalidEmail", WatchlistErrorCode.INVALID_EMAIL],
    ["invalidDomain", WatchlistErrorCode.INVALID_DOMAIN],
    ["invalidIp", WatchlistErrorCode.INVALID_IP],
    ["validationError", WatchlistErrorCode.VALIDATION_ERROR],
    ["permissionDenied", WatchlistErrorCode.PERMISSION_DENIED],
    ["duplicateEntry", WatchlistErrorCode.DUPLICATE_ENTRY],
    ["bulkDeletePartialFailure", WatchlistErrorCode.BULK_DELETE_PARTIAL_FAILURE],
  ];

  it.each(cases)("%s produces a WatchlistError with the %s code", (factory, code) => {
    const error = WatchlistErrors[factory](`${factory} failed`);

    expect(error).toBeInstanceOf(WatchlistError);
    expect(error.code).toBe(code);
    expect(error.message).toBe(`${factory} failed`);
  });
});
