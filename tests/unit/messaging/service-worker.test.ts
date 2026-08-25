/**
 * T08 — the service worker's own sender-validation function, tested
 * directly as a behavioural unit test (not "no crash happened"): a
 * `MessageSender` whose `id` disagrees with `chrome.runtime.id` must be
 * rejected, and a genuine one accepted. RED when `isTrustedSender` ever
 * accepts a mismatched sender, or is bypassed.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isTrustedSender } from "../../../src/messaging/service-worker";

const originalChrome = (globalThis as { chrome?: unknown }).chrome;

beforeEach(() => {
  (globalThis as { chrome?: unknown }).chrome = { runtime: { id: "this-extension-id" } };
});

afterEach(() => {
  (globalThis as { chrome?: unknown }).chrome = originalChrome;
});

describe("isTrustedSender (T08)", () => {
  it("accepts a sender whose id matches this extension's own id", () => {
    expect(isTrustedSender({ id: "this-extension-id" } as chrome.runtime.MessageSender)).toBe(true);
  });

  it("rejects a sender from a different (co-installed) extension", () => {
    expect(isTrustedSender({ id: "some-other-extension-id" } as chrome.runtime.MessageSender)).toBe(false);
  });

  it("rejects a sender with no id at all (e.g. a spoofed/malformed sender object)", () => {
    expect(isTrustedSender({} as chrome.runtime.MessageSender)).toBe(false);
  });
});
