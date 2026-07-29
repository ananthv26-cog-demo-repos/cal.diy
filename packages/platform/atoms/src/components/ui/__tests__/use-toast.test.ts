import { afterEach, describe, expect, it, vi } from "vitest";

import { reducer } from "../use-toast";

type ReducerState = Parameters<typeof reducer>[0];
type ReducerAction = Parameters<typeof reducer>[1];

type ToasterToast = ReducerState["toasts"][number];

const makeToast = (id: string, overrides: Partial<ToasterToast> = {}): ToasterToast => ({
  id,
  title: `toast-${id}`,
  open: true,
  ...overrides,
});

const dismiss = (toastId?: string): ReducerAction => ({ type: "DISMISS_TOAST", toastId });

describe("use-toast reducer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("ADD_TOAST", () => {
    it("should prepend the toast", () => {
      const state = reducer({ toasts: [] }, { type: "ADD_TOAST", toast: makeToast("1") });

      expect(state.toasts.map((t) => t.id)).toEqual(["1"]);
    });

    it("should enforce the toast limit of one by dropping older toasts", () => {
      const state = reducer(
        { toasts: [makeToast("1")] },
        { type: "ADD_TOAST", toast: makeToast("2") }
      );

      expect(state.toasts.map((t) => t.id)).toEqual(["2"]);
    });
  });

  describe("UPDATE_TOAST", () => {
    it("should merge fields into the matching toast only", () => {
      const state = reducer(
        { toasts: [makeToast("1"), makeToast("2")] },
        { type: "UPDATE_TOAST", toast: { id: "2", title: "updated" } }
      );

      expect(state.toasts.find((t) => t.id === "2")).toMatchObject({ title: "updated", open: true });
      expect(state.toasts.find((t) => t.id === "1")?.title).toBe("toast-1");
    });

    it("should be a no-op when the id does not exist", () => {
      const toasts = [makeToast("1")];
      const state = reducer({ toasts }, { type: "UPDATE_TOAST", toast: { id: "nope", title: "x" } });

      expect(state.toasts).toEqual(toasts);
    });
  });

  describe("DISMISS_TOAST", () => {
    it("should close the targeted toast and leave the others open", () => {
      const state = reducer({ toasts: [makeToast("1"), makeToast("2")] }, dismiss("1"));

      expect(state.toasts.find((t) => t.id === "1")?.open).toBe(false);
      expect(state.toasts.find((t) => t.id === "2")?.open).toBe(true);
    });

    it("should close every toast when no id is given", () => {
      const state = reducer({ toasts: [makeToast("1"), makeToast("2")] }, dismiss());

      expect(state.toasts.every((t) => t.open === false)).toBe(true);
    });

    it("should queue removal of the dismissed toast", () => {
      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

      reducer({ toasts: [makeToast("dismiss-once")] }, dismiss("dismiss-once"));
      reducer({ toasts: [makeToast("dismiss-once")] }, dismiss("dismiss-once"));

      expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("REMOVE_TOAST", () => {
    it("should remove only the given toast", () => {
      const state = reducer(
        { toasts: [makeToast("1"), makeToast("2")] },
        { type: "REMOVE_TOAST", toastId: "1" }
      );

      expect(state.toasts.map((t) => t.id)).toEqual(["2"]);
    });

    it("should clear all toasts when no id is given", () => {
      const state = reducer(
        { toasts: [makeToast("1"), makeToast("2")] },
        { type: "REMOVE_TOAST", toastId: undefined }
      );

      expect(state.toasts).toEqual([]);
    });
  });
});
