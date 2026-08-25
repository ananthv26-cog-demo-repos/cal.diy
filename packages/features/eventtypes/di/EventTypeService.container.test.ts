import { describe, expect, it } from "vitest";
import { EventTypeService } from "../service/EventTypeService";
import { getEventTypeService } from "./EventTypeService.container";
import { moduleLoader } from "./EventTypeService.module";
import { EVENT_TYPE_DI_TOKENS } from "./tokens";

describe("EVENT_TYPE_DI_TOKENS", () => {
  it("exposes distinct symbols for the service and its module", () => {
    expect(typeof EVENT_TYPE_DI_TOKENS.EVENT_TYPE_SERVICE).toBe("symbol");
    expect(typeof EVENT_TYPE_DI_TOKENS.EVENT_TYPE_SERVICE_MODULE).toBe("symbol");
    expect(EVENT_TYPE_DI_TOKENS.EVENT_TYPE_SERVICE).not.toBe(EVENT_TYPE_DI_TOKENS.EVENT_TYPE_SERVICE_MODULE);
    expect(EVENT_TYPE_DI_TOKENS.EVENT_TYPE_SERVICE.toString()).toContain("EventTypeService");
  });
});

describe("EventTypeService module loader", () => {
  it("binds the service on a token and exposes a loader", () => {
    expect(typeof moduleLoader.loadModule).toBe("function");
    expect(moduleLoader.token).toBeDefined();
  });
});

describe("getEventTypeService", () => {
  it("resolves an EventTypeService from the container", () => {
    expect(getEventTypeService()).toBeInstanceOf(EventTypeService);
  });

  it("is idempotent - loading the module twice returns an equivalent service", () => {
    const first = getEventTypeService();
    const second = getEventTypeService();
    expect(second).toBeInstanceOf(EventTypeService);
    expect(Object.getPrototypeOf(second)).toBe(Object.getPrototypeOf(first));
  });

  it("wires a repository into the service so branding lookups can run", async () => {
    const service = getEventTypeService();
    await expect(service.shouldHideBrandingForEventType(1, { team: null, owner: null })).resolves.toBe(false);
  });
});
