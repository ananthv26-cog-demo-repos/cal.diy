import { describe, expect, it } from "vitest";
import defaultEventsDefaultExport, {
  defaultEvents,
  dynamicEvent,
  getDefaultEvent,
  getDynamicEventDescription,
  getDynamicEventName,
  getGroupName,
  getUsernameList,
  getUsernameSlugLink,
} from "./defaultEvents";

describe("dynamicEvent", () => {
  it("is a 30 minute dynamic group meeting exposed as the only default event", () => {
    expect(dynamicEvent).toMatchObject({
      slug: "dynamic",
      length: 30,
      title: "Group Meeting",
      isDynamic: true,
    });
    expect(defaultEvents).toEqual([dynamicEvent]);
    expect(defaultEventsDefaultExport).toBe(defaultEvents);
  });

  it("supports the documented multiple durations", () => {
    expect(dynamicEvent.metadata?.multipleDuration).toEqual([15, 30, 45, 60, 90]);
  });
});

describe("getDefaultEvent", () => {
  it("returns the matching default event by slug", () => {
    expect(getDefaultEvent("dynamic")).toBe(dynamicEvent);
  });

  it("falls back to the dynamic event for an unknown slug", () => {
    expect(getDefaultEvent("does-not-exist")).toBe(dynamicEvent);
  });
});

describe("getDynamicEventDescription", () => {
  it("lists all usernames joined by a comma", () => {
    expect(getDynamicEventDescription(["alice", "bob"], "30")).toBe("Book a 30 min event with alice, bob");
  });

  it("handles a single username", () => {
    expect(getDynamicEventDescription(["alice"], "15")).toBe("Book a 15 min event with alice");
  });
});

describe("getDynamicEventName", () => {
  it("separates the last participant with an ampersand", () => {
    expect(getDynamicEventName(["alice", "bob", "carol"], "30")).toBe(
      "Dynamic Collective 30 min event with alice, bob & carol"
    );
  });

  it("mutates the passed array because the last name is popped off", () => {
    const names = ["alice", "bob"];
    getDynamicEventName(names, "30");
    expect(names).toEqual(["alice"]);
  });
});

describe("getGroupName", () => {
  it("joins usernames with a comma", () => {
    expect(getGroupName(["alice", "bob"])).toBe("alice, bob");
  });

  it("returns an empty string for no users", () => {
    expect(getGroupName([])).toBe("");
  });
});

describe("getUsernameSlugLink", () => {
  it("builds a plus-separated link for a group booking", () => {
    expect(getUsernameSlugLink({ users: [{ username: "alice" }, { username: "bob" }], slug: "30min" })).toBe(
      "/alice+bob/30min"
    );
  });

  it("builds a single user link", () => {
    expect(getUsernameSlugLink({ users: [{ username: "alice" }], slug: "30min" })).toBe("/alice/30min");
  });
});

describe("getUsernameList", () => {
  it("returns an empty list for undefined input", () => {
    expect(getUsernameList(undefined)).toEqual([]);
  });

  it("splits a plus separated string into slugified usernames", () => {
    expect(getUsernameList("alice+bob")).toEqual(["alice", "bob"]);
  });

  it("treats encoded separators (%20, %2b, space) as user separators", () => {
    expect(getUsernameList("alice%20bob")).toEqual(["alice", "bob"]);
    expect(getUsernameList("alice%2bbob")).toEqual(["alice", "bob"]);
    expect(getUsernameList("alice bob")).toEqual(["alice", "bob"]);
  });

  it("flattens and slugifies an array input", () => {
    expect(getUsernameList(["Alice Smith", "bob"])).toEqual(["alice", "smith", "bob"]);
  });

  it("drops empty segments produced by repeated separators", () => {
    expect(getUsernameList("alice++bob")).toEqual(["alice", "bob"]);
  });
});
