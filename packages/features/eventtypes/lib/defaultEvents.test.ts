import { describe, expect, it } from "vitest";
import {
  defaultEvents,
  dynamicEvent,
  getDefaultEvent,
  getDynamicEventDescription,
  getDynamicEventName,
  getGroupName,
  getUsernameList,
  getUsernameSlugLink,
} from "./defaultEvents";

describe("getDynamicEventDescription", () => {
  it("joins usernames with commas", () => {
    expect(getDynamicEventDescription(["alice", "bob", "carol"], "30")).toBe(
      "Book a 30 min event with alice, bob, carol"
    );
  });

  it("handles a single username", () => {
    expect(getDynamicEventDescription(["alice"], "15")).toBe("Book a 15 min event with alice");
  });

  it("handles an empty username list", () => {
    expect(getDynamicEventDescription([], "60")).toBe("Book a 60 min event with ");
  });
});

describe("getDynamicEventName", () => {
  it("separates the last name with an ampersand", () => {
    expect(getDynamicEventName(["alice", "bob", "carol"], "45")).toBe(
      "Dynamic Collective 45 min event with alice, bob & carol"
    );
  });

  it("leaves an empty prefix when only one name is given", () => {
    expect(getDynamicEventName(["alice"], "30")).toBe("Dynamic Collective 30 min event with  & alice");
  });

  it("mutates the input array because the last name is popped off", () => {
    const names = ["alice", "bob"];
    getDynamicEventName(names, "30");
    expect(names).toEqual(["alice"]);
  });

  it("renders undefined for the last name when the list is empty", () => {
    expect(getDynamicEventName([], "30")).toBe("Dynamic Collective 30 min event with  & undefined");
  });
});

describe("getDefaultEvent", () => {
  it("returns the matching default event for a known slug", () => {
    expect(getDefaultEvent("dynamic")).toBe(dynamicEvent);
  });

  it("falls back to the dynamic event for an unknown slug", () => {
    expect(getDefaultEvent("does-not-exist")).toBe(dynamicEvent);
  });

  it("exposes the dynamic event through defaultEvents", () => {
    expect(defaultEvents).toContain(dynamicEvent);
  });
});

describe("dynamicEvent", () => {
  it("is a 30 minute dynamic group meeting with multiple durations", () => {
    expect(dynamicEvent.slug).toBe("dynamic");
    expect(dynamicEvent.length).toBe(30);
    expect(dynamicEvent.isDynamic).toBe(true);
    expect(dynamicEvent.metadata?.multipleDuration).toEqual([15, 30, 45, 60, 90]);
  });
});

describe("getGroupName", () => {
  it("joins the username list with commas", () => {
    expect(getGroupName(["alice", "bob"])).toBe("alice, bob");
  });

  it("returns an empty string for no usernames", () => {
    expect(getGroupName([])).toBe("");
  });
});

describe("getUsernameSlugLink", () => {
  it("builds a single user link", () => {
    expect(getUsernameSlugLink({ users: [{ username: "alice" }], slug: "30min" })).toBe("/alice/30min");
  });

  it("joins multiple usernames with a plus sign", () => {
    expect(
      getUsernameSlugLink({ users: [{ username: "alice" }, { username: "bob" }], slug: "dynamic" })
    ).toBe("/alice+bob/dynamic");
  });

  it("keeps null usernames in the combined link", () => {
    expect(getUsernameSlugLink({ users: [{ username: null }, { username: "bob" }], slug: "x" })).toBe(
      "/+bob/x"
    );
  });
});

describe("getUsernameList", () => {
  it("returns an empty list for undefined", () => {
    expect(getUsernameList(undefined)).toEqual([]);
  });

  it("returns an empty list for an empty string", () => {
    expect(getUsernameList("")).toEqual([]);
  });

  it("splits a plus separated dynamic group", () => {
    expect(getUsernameList("alice+bob")).toEqual(["alice", "bob"]);
  });

  it("treats spaces and url encoded separators as plus signs", () => {
    expect(getUsernameList("alice bob")).toEqual(["alice", "bob"]);
    expect(getUsernameList("alice%20bob")).toEqual(["alice", "bob"]);
    expect(getUsernameList("alice%2Bbob")).toEqual(["alice", "bob"]);
  });

  it("drops empty segments produced by repeated separators", () => {
    expect(getUsernameList("alice++bob+")).toEqual(["alice", "bob"]);
  });

  it("accepts an array of usernames and flattens each entry", () => {
    expect(getUsernameList(["alice+bob", "carol"])).toEqual(["alice", "bob", "carol"]);
  });

  it("slugifies each username", () => {
    expect(getUsernameList("Alice.Doe")).toEqual(["alice.doe"]);
    expect(getUsernameList("Jösé")).toEqual(["jose"]);
  });
});
