import { describe, expect, it } from "vitest";
import { ContactProviderError } from "@/lib/contacts/provider";
import { clayUnavailableMessage, providerErrorQuery } from "@/lib/contacts/unavailable-message";

describe("providerErrorQuery", () => {
  it("carries the reason and status, never Clay's response text", () => {
    const error = new ContactProviderError("unavailable", "Clay returned HTTP 503. Acme Corp design director", {
      reason: "server_error",
      httpStatus: 503,
    });
    const query = providerErrorQuery(error);
    expect(query).toBe("tab=outreach&error=clay-unavailable&reason=server_error&status=503");
    expect(query).not.toContain("Acme");
  });

  it("omits detail for failures that have none", () => {
    const error = new ContactProviderError("rate_limited", "slow down");
    expect(providerErrorQuery(error)).toBe("tab=outreach&error=clay-rate_limited");
  });
});

describe("clayUnavailableMessage", () => {
  it("tells the user to check their connection when Clay was unreachable", () => {
    expect(clayUnavailableMessage("network", undefined)).toMatch(/internet connection/);
  });

  it("names Clay's error code for an outage", () => {
    const message = clayUnavailableMessage("server_error", "502");
    expect(message).toContain("problem on its side (error 502)");
  });

  it("points at the company link when Clay rejects the request", () => {
    expect(clayUnavailableMessage("request_rejected", "400")).toMatch(/turned down the request \(error 400\).*company website/);
  });

  it("sends routine failures back to Clay", () => {
    expect(clayUnavailableMessage("routine_failed", undefined)).toMatch(/Open the routine in Clay/);
    expect(clayUnavailableMessage("routine_timeout", undefined)).toMatch(/try Find email again/);
  });

  it("falls back to general wording for an unknown reason and ignores a malformed status", () => {
    const message = clayUnavailableMessage("<script>", "abc");
    expect(message).toMatch(/^Clay did not complete the request\. /);
  });
});
