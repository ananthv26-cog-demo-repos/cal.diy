import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, update, getBookingFieldsWithSystemFields } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  getBookingFieldsWithSystemFields: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  prisma: { eventType: { findUnique, update } },
  default: { eventType: { findUnique, update } },
}));

vi.mock("@calcom/features/bookings/lib/getBookingFields", () => ({
  getBookingFieldsWithSystemFields,
}));

import { removeBookingField, upsertBookingField } from "./bookingFieldsManager";

const routingFormSource = { id: "routing-form-1", type: "routing-form" as const, label: "Form" };

function mockEventType({
  bookingFields,
  teamId = null,
  organizationId = null,
}: {
  bookingFields: unknown[];
  teamId?: number | null;
  organizationId?: number | null;
}) {
  findUnique.mockResolvedValue({
    id: 1,
    teamId,
    customInputs: [],
    profile: organizationId === null ? null : { organizationId },
  });
  getBookingFieldsWithSystemFields.mockReturnValue(bookingFields);
}

function updatedFields() {
  return update.mock.calls[0][0].data.bookingFields;
}

describe("bookingFieldsManager", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset().mockResolvedValue({});
    getBookingFieldsWithSystemFields.mockReset();
  });

  describe("upsertBookingField", () => {
    it("appends the field when it does not exist yet", async () => {
      mockEventType({ bookingFields: [{ name: "name", type: "name" }] });

      await upsertBookingField(
        { name: "custom", type: "text" },
        { ...routingFormSource, fieldRequired: true },
        1
      );

      expect(updatedFields()).toEqual([
        { name: "name", type: "name" },
        {
          name: "custom",
          type: "text",
          required: true,
          sources: [{ ...routingFormSource, fieldRequired: true }],
        },
      ]);
      expect(update.mock.calls[0][0].where).toEqual({ id: 1 });
    });

    it("adds a new source to an existing field and keeps the other fields untouched", async () => {
      mockEventType({
        bookingFields: [
          { name: "name", type: "name" },
          {
            name: "custom",
            type: "text",
            required: false,
            sources: [{ id: "other", type: "routing-form", fieldRequired: false }],
          },
        ],
      });

      await upsertBookingField(
        { name: "custom", type: "text" },
        { ...routingFormSource, fieldRequired: false },
        1
      );

      const [nameField, customField] = updatedFields();
      expect(nameField).toEqual({ name: "name", type: "name" });
      expect(customField.sources).toEqual([
        { id: "other", type: "routing-form", fieldRequired: false },
        { ...routingFormSource, fieldRequired: false },
      ]);
    });

    it("updates an existing source in place", async () => {
      mockEventType({
        bookingFields: [
          {
            name: "custom",
            type: "text",
            required: false,
            sources: [{ ...routingFormSource, fieldRequired: false, label: "Old" }],
          },
        ],
      });

      await upsertBookingField(
        { name: "custom", type: "text" },
        { ...routingFormSource, fieldRequired: true },
        1
      );

      expect(updatedFields()[0].sources).toEqual([{ ...routingFormSource, fieldRequired: true }]);
    });

    it("marks the field required when at least one source requires it", async () => {
      mockEventType({
        bookingFields: [
          {
            name: "custom",
            type: "text",
            required: true,
            sources: [{ id: "other", type: "routing-form", fieldRequired: true }],
          },
        ],
      });

      await upsertBookingField(
        { name: "custom", type: "text" },
        { ...routingFormSource, fieldRequired: false },
        1
      );

      expect(updatedFields()[0].required).toBe(true);
    });

    it("marks the field optional when no source requires it", async () => {
      mockEventType({
        bookingFields: [{ name: "custom", type: "text", required: true, sources: [] }],
      });

      await upsertBookingField(
        { name: "custom", type: "text" },
        { ...routingFormSource, fieldRequired: false },
        1
      );

      expect(updatedFields()[0].required).toBe(false);
    });

    it("flags org team events when the event belongs to a team inside an organization", async () => {
      mockEventType({ bookingFields: [], teamId: 5, organizationId: 9 });

      await upsertBookingField(
        { name: "custom", type: "text" },
        { ...routingFormSource, fieldRequired: false },
        1
      );

      expect(getBookingFieldsWithSystemFields).toHaveBeenCalledWith(
        expect.objectContaining({ isOrgTeamEvent: true })
      );
      expect(getBookingFieldsWithSystemFields.mock.calls[0][0]).not.toHaveProperty("profile");
    });

    it("does not flag org team events for a personal event", async () => {
      mockEventType({ bookingFields: [], teamId: null, organizationId: 9 });

      await upsertBookingField(
        { name: "custom", type: "text" },
        { ...routingFormSource, fieldRequired: false },
        1
      );

      expect(getBookingFieldsWithSystemFields).toHaveBeenCalledWith(
        expect.objectContaining({ isOrgTeamEvent: false })
      );
    });

    it("throws when the event type does not exist", async () => {
      findUnique.mockResolvedValue(null);

      await expect(
        upsertBookingField({ name: "custom", type: "text" }, { ...routingFormSource, fieldRequired: true }, 7)
      ).rejects.toThrow("EventType:7 not found");
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe("removeBookingField", () => {
    it("removes the field entirely when its last source is removed", async () => {
      mockEventType({
        bookingFields: [
          { name: "name", type: "name" },
          {
            name: "custom",
            type: "text",
            required: true,
            sources: [{ ...routingFormSource, fieldRequired: true }],
          },
        ],
      });

      await removeBookingField({ name: "custom" }, routingFormSource, 1);

      expect(updatedFields()).toEqual([{ name: "name", type: "name" }]);
    });

    it("keeps the field and recomputes required when other sources remain", async () => {
      mockEventType({
        bookingFields: [
          {
            name: "custom",
            type: "text",
            required: true,
            sources: [
              { ...routingFormSource, fieldRequired: true },
              { id: "other", type: "routing-form", fieldRequired: false },
            ],
          },
        ],
      });

      await removeBookingField({ name: "custom" }, routingFormSource, 1);

      expect(updatedFields()).toEqual([
        {
          name: "custom",
          type: "text",
          required: false,
          sources: [{ id: "other", type: "routing-form", fieldRequired: false }],
        },
      ]);
    });

    it("leaves the field untouched when the source is not attached to it", async () => {
      const fields = [
        {
          name: "custom",
          type: "text",
          required: true,
          sources: [{ id: "other", type: "routing-form", fieldRequired: true }],
        },
      ];
      mockEventType({ bookingFields: fields });

      await removeBookingField({ name: "custom" }, routingFormSource, 1);

      expect(updatedFields()).toEqual(fields);
    });

    it("treats a field without sources as having nothing to remove", async () => {
      mockEventType({ bookingFields: [{ name: "custom", type: "text" }] });

      await removeBookingField({ name: "custom" }, routingFormSource, 1);

      expect(updatedFields()).toEqual([{ name: "custom", type: "text" }]);
    });

    it("throws when the event type does not exist", async () => {
      findUnique.mockResolvedValue(null);

      await expect(removeBookingField({ name: "custom" }, routingFormSource, 7)).rejects.toThrow(
        "EventType:7 not found"
      );
      expect(update).not.toHaveBeenCalled();
    });
  });
});
