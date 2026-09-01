import { renderHook } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EventTypeAssignedUsers, EventTypeHosts } from "@calcom/features/eventtypes/lib/types";
import { MembershipRole } from "@calcom/prisma/enums";

import { useHandleRouteChange } from "./useHandleRouteChange";

const assignedUser: EventTypeAssignedUsers[number] = {
  owner: {
    avatar: "",
    email: "alice@example.com",
    name: "Alice",
    username: "alice",
    membership: MembershipRole.MEMBER,
    id: 1,
    avatarUrl: null,
    nonProfileUsername: null,
    profile: {
      id: 1,
      username: "alice",
      upId: "usr-1",
      organizationId: null,
      organization: null,
    },
  },
  created: true,
  hidden: false,
  slug: "thirty-min",
};

const host: EventTypeHosts[number] = {
  user: { timeZone: "Europe/London" },
  userId: 1,
  scheduleId: null,
  isFixed: true,
  priority: null,
  weight: null,
  groupId: null,
};

type Props = Parameters<typeof useHandleRouteChange>[0];

const renderWithProps = (
  overrides: Partial<Props> = {}
): {
  handleRouteChange: (url: string) => void;
  onError: Mock;
  onStart: Mock;
  onEnd: Mock;
  unmount: () => void;
} => {
  const onError = vi.fn();
  const onStart = vi.fn();
  const onEnd = vi.fn();

  const { unmount } = renderHook(() =>
    useHandleRouteChange({
      isTeamEventTypeDeleted: false,
      isleavingWithoutAssigningHosts: false,
      isTeamEventType: true,
      assignedUsers: [],
      hosts: [],
      assignAllTeamMembers: false,
      isManagedEventType: false,
      watchTrigger: 0,
      onError,
      onStart,
      onEnd,
      ...overrides,
    })
  );

  const handleRouteChange = onStart.mock.calls[0][0] as (url: string) => void;

  return { handleRouteChange, onError, onStart, onEnd, unmount };
};

describe("useHandleRouteChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should register the route change handler on mount and unregister it on unmount", () => {
    const { onStart, onEnd, handleRouteChange, unmount } = renderWithProps();

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();

    unmount();

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0][0]).toBe(handleRouteChange);
  });

  it("should warn when leaving a team event type without hosts", () => {
    const { handleRouteChange, onError } = renderWithProps();

    handleRouteChange("/event-types");

    expect(onError).toHaveBeenCalledWith("/event-types");
  });

  it("should warn when navigating away from the event-types section entirely", () => {
    const { handleRouteChange, onError } = renderWithProps();

    handleRouteChange("/bookings/upcoming");

    expect(onError).toHaveBeenCalledWith("/bookings/upcoming");
  });

  it("should not warn when navigating within a specific event type", () => {
    const { handleRouteChange, onError } = renderWithProps();

    handleRouteChange("/event-types/123?tabName=team");

    expect(onError).not.toHaveBeenCalled();
  });

  it("should not warn when the event type was deleted", () => {
    const { handleRouteChange, onError } = renderWithProps({ isTeamEventTypeDeleted: true });

    handleRouteChange("/event-types");

    expect(onError).not.toHaveBeenCalled();
  });

  it("should not warn for non team event types", () => {
    const { handleRouteChange, onError } = renderWithProps({ isTeamEventType: false });

    handleRouteChange("/event-types");

    expect(onError).not.toHaveBeenCalled();
  });

  it("should not warn when the user knowingly leaves without assigning hosts", () => {
    const { handleRouteChange, onError } = renderWithProps({ isleavingWithoutAssigningHosts: true });

    handleRouteChange("/event-types");

    expect(onError).not.toHaveBeenCalled();
  });

  it("should not warn when all team members are assigned", () => {
    const { handleRouteChange, onError } = renderWithProps({ assignAllTeamMembers: true });

    handleRouteChange("/event-types");

    expect(onError).not.toHaveBeenCalled();
  });

  it("should not warn when hosts are assigned", () => {
    const { handleRouteChange, onError } = renderWithProps({ hosts: [host] });

    handleRouteChange("/event-types");

    expect(onError).not.toHaveBeenCalled();
  });

  describe("managed event types", () => {
    it("should warn when no users are assigned even if hosts exist", () => {
      const { handleRouteChange, onError } = renderWithProps({
        isManagedEventType: true,
        hosts: [host],
        assignedUsers: [],
      });

      handleRouteChange("/event-types");

      expect(onError).toHaveBeenCalledWith("/event-types");
    });

    it("should not warn when users are assigned even if hosts are empty", () => {
      const { handleRouteChange, onError } = renderWithProps({
        isManagedEventType: true,
        hosts: [],
        assignedUsers: [assignedUser],
      });

      handleRouteChange("/event-types");

      expect(onError).not.toHaveBeenCalled();
    });
  });

  it("should not throw when no callbacks are provided", () => {
    expect(() =>
      renderHook(() =>
        useHandleRouteChange({
          isTeamEventTypeDeleted: false,
          isleavingWithoutAssigningHosts: false,
          isTeamEventType: true,
          assignedUsers: [],
          hosts: [],
          assignAllTeamMembers: false,
          isManagedEventType: false,
          watchTrigger: 0,
        })
      )
    ).not.toThrow();
  });
});
