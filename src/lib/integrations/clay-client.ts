import { safeFetch } from "../safe-fetch";
import type { IntegrationConnectionStatus } from "../db/types";

/**
 * Minimal Clay Public API client — connection testing only (PRD v0.2.1 §43).
 *
 * People search, company resolution and the structured-filter field catalog
 * arrive in Phase 6, behind the ContactProvider interface, so no Clay response
 * shape escapes this directory.
 */

const CLAY_API_BASE = "https://api.clay.com/public/v0";

/**
 * Identity endpoint, not a search. §43 and §79 are explicit that testing a
 * credential must not consume a people-search result — searches are metered per
 * plan and return 402 when the allowance is gone, so a "test" that spends one
 * would be charging the user to find out whether their key is typed correctly.
 *
 * Verified 2026-08-18 against
 * https://developers.clay.com/api-reference/me/get-the-authenticated-user
 * — GET https://api.clay.com/public/v0/me, `clay-api-key` header, returning
 * `{ user: { id, name }, workspace: { id } }`.
 *
 * The docs are wrong about which key works. They say "personal API key tied to
 * your Clay user" (`clay_user_…`, Profile → API key); that key returns 401
 * "Authentication required". What actually authenticates is a **scoped** key from
 * Profile → API keys (beta) carrying the Public API scope (`clay_scoped_…`),
 * confirmed working against a live account. Phase 6 should assume scoped keys and
 * re-check whether the personal key is still accepted at all.
 */
const CLAY_IDENTITY_PATH = "/me";

export type ClayConnectionResult = {
  status: IntegrationConnectionStatus;
  accountLabel: string;
  message: string;
  metadata: Record<string, string>;
};

type ClayIdentityResponse = {
  user?: { id?: string; name?: string; cli_onboarded?: boolean };
  workspace?: { id?: string; name?: string };
};

/**
 * The documented response carries `user.name` and a workspace *id* — there is no
 * workspace name to show, so the user's own name is the useful label. The
 * workspace name is read anyway in case the schema gains one.
 */
function labelFor(body: ClayIdentityResponse): string {
  return body.workspace?.name || body.user?.name || "Clay account";
}

/** Clay returns `{ "message": "..." }` on failure. Best-effort — never throw from here. */
async function readClayMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    return (body.message ?? body.error ?? "").slice(0, 200);
  } catch {
    return "";
  }
}

export async function testClayConnection(apiKey: string): Promise<ClayConnectionResult> {
  if (!apiKey.trim()) {
    return { status: "not_connected", accountLabel: "", message: "No API key saved.", metadata: {} };
  }

  try {
    const res = await safeFetch(`${CLAY_API_BASE}${CLAY_IDENTITY_PATH}`, {
      headers: { Accept: "application/json", "clay-api-key": apiKey },
    });

    if (res.status === 401 || res.status === 403) {
      // Clay explains itself — "Authentication required" reads very differently
      // from a scope or plan error, and swallowing it sends the user hunting for
      // a typo when the real problem is which key they used.
      const detail = await readClayMessage(res);
      return {
        status: "invalid_credential",
        accountLabel: "",
        message: detail
          ? `Clay rejected this key: ${detail}. Try the scoped key from Clay's "API keys (beta)" tab with the Public API scope, and re-copy it in case it was regenerated.`
          : 'Clay rejected this key. Try the scoped key from Clay\'s "API keys (beta)" tab with the Public API scope.',
        metadata: { httpStatus: String(res.status) },
      };
    }

    if (res.status === 429) {
      return {
        status: "unavailable",
        accountLabel: "",
        message: "Clay rate-limited the request. Wait a moment and test again.",
        metadata: { httpStatus: "429" },
      };
    }

    if (!res.ok) {
      // Anything else — including a 404 if the API moves — is reported as
      // "could not reach Clay", never as a working connection.
      return {
        status: "unavailable",
        accountLabel: "",
        message: `Clay responded with HTTP ${res.status}. The service may be unavailable, or the API may have changed.`,
        metadata: { httpStatus: String(res.status) },
      };
    }

    const body = (await res.json()) as ClayIdentityResponse;
    const metadata: Record<string, string> = {};
    if (body.workspace?.id) metadata.workspaceId = body.workspace.id;
    if (body.user?.id) metadata.userId = body.user.id;
    return { status: "connected", accountLabel: labelFor(body), message: "Connected to Clay.", metadata };
  } catch (error) {
    return {
      status: "unavailable",
      accountLabel: "",
      message: `Could not reach Clay: ${error instanceof Error ? error.message : String(error)}`,
      metadata: {},
    };
  }
}
