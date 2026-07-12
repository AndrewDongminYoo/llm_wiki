/**
 * Tests for the page-merge layer that decides what content to write
 * when an ingest produces a wiki page that already exists on disk.
 *
 * The merger function (LLM call) is injected so these tests run
 * deterministically without hitting any model. A separate real-llm
 * test suite exercises the wired-up production path against the
 * actual generation model.
 */
import { describe, it, expect, vi } from "vitest";
import { mergePageContent } from "./page-merge";

const PAGE = (fm: string, body: string) => `---\n${fm}\n---\n\n${body}`;

const FIXED_TODAY = () => "2026-04-30";
const baseOpts = {
  sourceFileName: "doc-B.pdf",
  pagePath: "wiki/entities/foo.md",
  today: FIXED_TODAY,
};

// ──────────────────────────────────────────────────────────────────
// Fast paths — no LLM call should happen
// ──────────────────────────────────────────────────────────────────

describe("mergePageContent — fast paths", () => {
  it("returns newContent when existingContent is null (new page)", async () => {
    const merger = vi.fn();
    const out = await mergePageContent(
      PAGE('type: entity\ntitle: Foo\nsources: ["doc.pdf"]', "body"),
      null,
      merger,
      baseOpts,
    );
    expect(out).toContain('sources: ["doc.pdf"]');
    expect(merger).not.toHaveBeenCalled();
  });

  it("returns existingContent when both contents are byte-identical", async () => {
    const merger = vi.fn();
    const c = PAGE("type: entity\ntitle: Foo", "body");
    const out = await mergePageContent(c, c, merger, baseOpts);
    expect(out).toBe(c);
    expect(merger).not.toHaveBeenCalled();
  });

  it("skips LLM when bodies are identical (only sources differ)", async () => {
    // Re-ingest of the same file from a different source just adds
    // its source filename — body is byte-identical. Don't waste an
    // LLM call on this.
    const merger = vi.fn();
    const existing = PAGE(
      'type: entity\ntitle: Foo\nsources: ["a.pdf"]',
      "same body",
    );
    const incoming = PAGE(
      'type: entity\ntitle: Foo\nsources: ["b.pdf"]',
      "same body",
    );
    const out = await mergePageContent(incoming, existing, merger, baseOpts);
    expect(out).toContain('sources: ["a.pdf", "b.pdf"]');
    expect(out).toContain("same body");
    expect(merger).not.toHaveBeenCalled();
  });

  it("preserves locked scope/project/account on the identical-body fast path", async () => {
    // Same body, only frontmatter differs -> fast path returns
    // array-merged content with no LLM. Incoming omits the facets; they
    // must still be forced back from the existing page.
    const merger = vi.fn();
    const existing = PAGE(
      'type: entity\ntitle: Foo\nscope: project\nproject: rn-receipt\naccount: work\nsources: ["a.pdf"]',
      "same body",
    );
    const incoming = PAGE(
      'type: entity\ntitle: Foo\nsources: ["b.pdf"]',
      "same body",
    );
    const out = await mergePageContent(incoming, existing, merger, baseOpts);
    expect(out).toContain("scope: project");
    expect(out).toContain("project: rn-receipt");
    expect(out).toContain("account: work");
    expect(merger).not.toHaveBeenCalled();
  });
});

describe("mergePageContent — corrected single-source replacement", () => {
  it("replaces only the body while preserving metadata, arrays, and backup", async () => {
    const existing = PAGE(
      'type: entity\ntitle: Stable title\ncreated: 2025-01-01\nupdated: 2025-01-02\nsources: ["doc.pdf"]\ntags: [manual]\nrelated: [kept-link]',
      "obsolete source wording plus a manual-era body",
    )
    const incoming = PAGE(
      'type: concept\ntitle: Changed title\ncreated: 2026-01-01\nsources: ["doc.pdf"]\ntags: [generated]\nrelated: [new-link]',
      "corrected source wording",
    )
    const merger = vi.fn()
    const backup = vi.fn().mockResolvedValue(undefined)

    const out = await mergePageContent(incoming, existing, merger, {
      ...baseOpts,
      replaceExistingBody: true,
      backup,
    })

    expect(out).toContain("corrected source wording")
    expect(out).not.toContain("obsolete source wording")
    expect(out).toContain("type: entity")
    expect(out).toContain("title: Stable title")
    expect(out).toContain("created: 2025-01-01")
    expect(out).toContain("updated: 2026-04-30")
    expect(out).toMatch(/tags:\s*\[\s*"manual",\s*"generated"\s*\]/)
    expect(out).toMatch(/related:\s*\[\s*"kept-link",\s*"new-link"\s*\]/)
    expect(backup).toHaveBeenCalledWith(existing)
    expect(merger).not.toHaveBeenCalled()
  })

  it("keeps normal merge behavior for a page with another source", async () => {
    const existing = PAGE(
      'type: entity\ntitle: Shared\nsources: ["doc.pdf", "other.pdf"]',
      "other source contribution",
    )
    const incoming = PAGE(
      'type: entity\ntitle: Shared\nsources: ["doc.pdf"]',
      "corrected doc contribution",
    )
    const merger = vi.fn().mockResolvedValue(PAGE(
      'type: entity\ntitle: Shared\nsources: ["doc.pdf", "other.pdf"]',
      "other source contribution and corrected doc contribution retained together",
    ))

    const out = await mergePageContent(incoming, existing, merger, baseOpts)
    expect(merger).toHaveBeenCalledOnce()
    expect(out).toContain("other source contribution")
    expect(out).toContain("corrected doc contribution")
  })
})

// ──────────────────────────────────────────────────────────────────
// LLM merge happy path
// ──────────────────────────────────────────────────────────────────

describe("mergePageContent — LLM merge", () => {
  it("calls the merger when bodies differ and uses the merged output", async () => {
    const existing = PAGE(
      'type: entity\ntitle: Accumulibacter\ncreated: 2026-04-09\ntags: [microbiology, ebpr]\nrelated: [dpao, vfa]\nsources: ["doc-A.pdf"]',
      "## Anaerobic Phase\n\nDescription from doc A.\n\n## Denitrification\n\nMore from doc A.",
    );
    const incoming = PAGE(
      'type: entity\ntitle: Accumulibacter\ncreated: 2026-04-30\ntags: [paos, propionate]\nrelated: [pha]\nsources: ["doc-B.pdf"]',
      "## Carbon Source Preferences\n\nDescription from doc B.\n\n## Acetate vs Propionate\n\nMore from doc B.",
    );
    const mergedBody =
      "## Anaerobic Phase\n\nDescription from doc A.\n\n## Denitrification\n\nMore from doc A.\n\n## Carbon Source Preferences\n\nDescription from doc B.\n\n## Acetate vs Propionate\n\nMore from doc B.";
    const merger = vi.fn().mockResolvedValue(
      PAGE(
        // LLM might also output frontmatter — we'll override locked fields.
        'type: entity\ntitle: Accumulibacter\ncreated: 2026-04-09\ntags: [paos, propionate]\nrelated: [pha]\nsources: ["doc-B.pdf"]',
        mergedBody,
      ),
    );
    const out = await mergePageContent(incoming, existing, merger, baseOpts);

    expect(merger).toHaveBeenCalledOnce();

    // Body uses LLM-merged version
    expect(out).toContain("Anaerobic Phase");
    expect(out).toContain("Carbon Source Preferences");

    // Locked fields preserved from existing
    expect(out).toContain("title: Accumulibacter");
    expect(out).toContain("created: 2026-04-09");
    expect(out).toContain("type: entity");

    // updated forced to today
    expect(out).toContain("updated: 2026-04-30");

    // Array fields are unions
    expect(out).toMatch(/sources:\s*\[\s*"doc-A.pdf",\s*"doc-B.pdf"\s*\]/);
    expect(out).toMatch(
      /tags:\s*\[\s*"microbiology",\s*"ebpr",\s*"paos",\s*"propionate"\s*\]/,
    );
    expect(out).toMatch(/related:\s*\[\s*"dpao",\s*"vfa",\s*"pha"\s*\]/);
  });

  it("preserves locked title even if LLM rewrote it", async () => {
    // Title changes break wikilinks — never accept LLM-rewritten title.
    const existing = PAGE(
      "type: entity\ntitle: Accumulibacter",
      "old body content here",
    );
    const incoming = PAGE(
      "type: entity\ntitle: Accumulibacter",
      "very different new body here",
    );
    const merger = vi
      .fn()
      .mockResolvedValue(
        PAGE(
          "type: entity\ntitle: ACCUMULIBACTER (renamed)",
          "merged body that is reasonably long enough to pass the threshold check",
        ),
      );
    const out = await mergePageContent(incoming, existing, merger, baseOpts);
    expect(out).toContain("title: Accumulibacter");
    expect(out).not.toContain("ACCUMULIBACTER (renamed)");
  });

  it("preserves locked type even if LLM changed it", async () => {
    const existing = PAGE("type: entity\ntitle: Foo", "original body content");
    const incoming = PAGE(
      "type: entity\ntitle: Foo",
      "new content from another source",
    );
    const merger = vi
      .fn()
      .mockResolvedValue(
        PAGE(
          "type: concept\ntitle: Foo",
          "merged body that is long enough to clear the seventy percent threshold",
        ),
      );
    const out = await mergePageContent(incoming, existing, merger, baseOpts);
    expect(out).toContain("type: entity");
    expect(out).not.toContain("type: concept");
  });

  it("preserves locked scope/project/account even if the LLM changes or drops them", async () => {
    // scope/project/account are deterministic facets seeded downstream
    // (path-derived scope/project; a project->account map for account).
    // The LLM must never be able to rewrite or silently drop them on a
    // re-ingest — otherwise the account-separation boundary and scoped
    // retrieval break.
    const existing = PAGE(
      "type: concept\ntitle: Foo\nscope: project\nproject: react-native-receipt-scanner\naccount: work",
      "original body content",
    );
    const incoming = PAGE(
      "type: concept\ntitle: Foo",
      "new content from another source",
    );
    const merger = vi.fn().mockResolvedValue(
      // LLM drops scope/account entirely and emits a wrong project.
      PAGE(
        "type: concept\ntitle: Foo\nproject: something-else",
        "merged body that is long enough to clear the seventy percent threshold",
      ),
    );
    const out = await mergePageContent(incoming, existing, merger, baseOpts);
    expect(out).toContain("scope: project");
    expect(out).toContain("project: react-native-receipt-scanner");
    expect(out).toContain("account: work");
    expect(out).not.toContain("something-else");
  });

  it("fully removes a block-form locked field the LLM emitted (no orphaned list items)", async () => {
    // Locked fields are scalars by contract. If the LLM emits one in
    // block form (`scope:` + indented list items), forcing the scalar
    // back must consume the whole entry — replacing only the `scope:`
    // line would leave the indented items behind and corrupt the YAML.
    const existing = PAGE(
      "type: concept\ntitle: Foo\nscope: project\nproject: rn-receipt\naccount: work",
      "original body content",
    );
    const incoming = PAGE("type: concept\ntitle: Foo", "new content");
    const merger = vi.fn().mockResolvedValue(
      PAGE(
        "type: concept\ntitle: Foo\nscope:\n  - project\n  - global\nproject: rn-receipt\naccount: work",
        "merged body that is long enough to clear the seventy percent threshold",
      ),
    );
    const out = await mergePageContent(incoming, existing, merger, baseOpts);
    expect(out).toContain("scope: project");
    // The block-form list items must be gone, not orphaned under the scalar.
    expect(out).not.toContain("- global");
    expect(out).not.toMatch(/scope: project\n\s+-/);
  });
});

// ──────────────────────────────────────────────────────────────────
// LLM failure / sanity rejection — always falls back safely
// ──────────────────────────────────────────────────────────────────

describe("mergePageContent — LLM failure fallback", () => {
  it("falls back to array-merged incoming when LLM throws", async () => {
    const existing = PAGE(
      'type: entity\ntitle: Foo\ntags: [old]\nsources: ["a.pdf"]',
      "old body content",
    );
    const incoming = PAGE(
      'type: entity\ntitle: Foo\ntags: [new]\nsources: ["b.pdf"]',
      "new body content",
    );
    const merger = vi.fn().mockRejectedValue(new Error("LLM rate limited"));
    const out = await mergePageContent(incoming, existing, merger, baseOpts);

    // Array fields are still merged (no LLM needed for that)
    expect(out).toMatch(/tags:\s*\[\s*"old",\s*"new"\s*\]/);
    expect(out).toMatch(/sources:\s*\[\s*"a.pdf",\s*"b.pdf"\s*\]/);
    // Body is the new (incoming) one — old body is lost; this is the
    // pre-LLM-merge behavior, the documented fallback contract.
    expect(out).toContain("new body content");
  });

  it("preserves the richer existing body when the merge is rejected as too short", async () => {
    // A single-source re-ingest legitimately produces a short body; the merge
    // shrink-guard then rejects the LLM output. The fallback must keep the
    // existing rich body, not clobber it with the sparse incoming one.
    const richBody = "## Details\n\n" + "curated existing content. ".repeat(60);
    const existing = PAGE(
      'type: entity\ntitle: Foo\ntags: [old]\nsources: ["a.pdf"]',
      richBody,
    );
    const incoming = PAGE(
      'type: entity\ntitle: Foo\ntags: [new]\nsources: ["b.pdf"]',
      "tiny regenerated body",
    );
    const merger = vi
      .fn()
      .mockResolvedValue(
        PAGE("type: entity\ntitle: Foo", "also a tiny merged body"),
      );
    const out = await mergePageContent(incoming, existing, merger, baseOpts);
    expect(out).toContain("curated existing content"); // rich body kept
    expect(out).not.toContain("tiny regenerated body");
    // Arrays still unioned (order is not significant across fallback paths).
    expect(out).toMatch(/tags:\s*\[[^\]]*"old"[^\]]*\]/);
    expect(out).toMatch(/tags:\s*\[[^\]]*"new"[^\]]*\]/);
    expect(out).toContain("updated: 2026-04-30"); // refreshed
  });

  it("preserves the richer existing body when the LLM merge throws", async () => {
    const richBody = "existing prose paragraph. ".repeat(60);
    const existing = PAGE(
      'type: entity\ntitle: Foo\nsources: ["a.pdf"]',
      richBody,
    );
    const incoming = PAGE(
      'type: entity\ntitle: Foo\nsources: ["b.pdf"]',
      "short new stub",
    );
    const merger = vi.fn().mockRejectedValue(new Error("boom"));
    const out = await mergePageContent(incoming, existing, merger, baseOpts);
    expect(out).toContain("existing prose paragraph");
    expect(out).not.toContain("short new stub");
  });

  it("keeps valid frontmatter when the existing page has none (legacy file)", async () => {
    // A legacy/manual on-disk page: long body, but no parseable frontmatter.
    // A merge failure must not write a frontmatter-less page — the body-
    // preserve path is gated off, so it falls back to the incoming (valid)
    // frontmatter rather than the bare existing content.
    const existing = "# Legacy\n\n" + "hand-written content. ".repeat(50);
    const incoming = PAGE(
      'type: entity\ntitle: Foo\nsources: ["b.pdf"]',
      "short regen",
    );
    const merger = vi.fn().mockRejectedValue(new Error("boom"));
    const out = await mergePageContent(incoming, existing, merger, baseOpts);
    expect(out.startsWith("---")).toBe(true); // has frontmatter
    expect(out).toContain("type: entity"); // the incoming valid frontmatter
    expect(out).toContain("title: Foo");
  });

  it("preserves locked scope/project/account on the LLM-failure fallback", async () => {
    // The fallback returns array-merged content that starts from the
    // incoming (LLM) frontmatter. Locked facets must still be forced
    // back, or a failed merge silently drops the account boundary.
    const existing = PAGE(
      'type: entity\ntitle: Foo\nscope: project\nproject: rn-receipt\naccount: work\nsources: ["a.pdf"]',
      "old body content",
    );
    const incoming = PAGE(
      'type: entity\ntitle: Foo\nsources: ["b.pdf"]',
      "new body content",
    );
    const merger = vi.fn().mockRejectedValue(new Error("LLM rate limited"));
    const out = await mergePageContent(incoming, existing, merger, baseOpts);
    expect(out).toContain("scope: project");
    expect(out).toContain("project: rn-receipt");
    expect(out).toContain("account: work");
  });

  it("preserves YAML quoting when locking a title that contains a colon", async () => {
    // Source pages carry `title: "Source: ..."` (ingest.ts). The colon
    // makes the value require quotes; writing the parsed value back raw
    // would emit `title: Source: ...`, which js-yaml rejects — corrupting
    // frontmatter that was valid on the way in.
    const existing = PAGE(
      'type: source\ntitle: "Source: invoice.pdf"\nsources: ["invoice.pdf"]',
      "old body content",
    );
    const incoming = PAGE(
      'type: source\ntitle: "Source: invoice.pdf"\nsources: ["invoice.pdf"]',
      "new body content",
    );
    const merger = vi.fn().mockRejectedValue(new Error("LLM down"));
    const out = await mergePageContent(incoming, existing, merger, baseOpts);
    expect(out).toContain('title: "Source: invoice.pdf"');
    expect(out).not.toMatch(/^title: Source: invoice\.pdf$/m);
  });

  it("preserves $ sequences in a locked value (no replacement-string expansion)", async () => {
    // The locked value is used as a String.replace replacement, where
    // `$1`/`$&`/`$'` are special. A title containing them must survive.
    const existing = PAGE(
      'type: source\ntitle: "Cost: $1 & $& literal"\nsources: ["a.pdf"]',
      "old body content",
    );
    const incoming = PAGE(
      'type: source\ntitle: "LLM rewrote this"\nsources: ["b.pdf"]',
      "new body content",
    );
    const merger = vi.fn().mockRejectedValue(new Error("LLM down"));
    const out = await mergePageContent(incoming, existing, merger, baseOpts);
    expect(out).toContain('title: "Cost: $1 & $& literal"');
  });

  it("does not let an empty locked field consume the next frontmatter line", async () => {
    // `\s*` after `field:` would span the newline and pull the following
    // field's text into the empty one; the match must stay on its line.
    const existing = PAGE(
      'type: entity\ncreated:\ntitle: RealTitle\nsources: ["a.pdf"]',
      "old body content",
    );
    const incoming = PAGE(
      'type: entity\ntitle: RealTitle\nsources: ["b.pdf"]',
      "new body content",
    );
    const merger = vi.fn().mockRejectedValue(new Error("LLM down"));
    const out = await mergePageContent(incoming, existing, merger, baseOpts);
    expect(out).not.toContain("created: title:");
  });

  it("rejects LLM output that shrinks body below 70% of max(old, new)", async () => {
    const longBody = "long body content ".repeat(200); // ~3600 chars
    const existing = PAGE("type: entity\ntitle: Foo", longBody);
    const incoming = PAGE(
      "type: entity\ntitle: Foo",
      "incoming body that is also pretty long " + longBody,
    );
    const merger = vi
      .fn()
      .mockResolvedValue(PAGE("type: entity\ntitle: Foo", "tiny merged body"));
    const out = await mergePageContent(incoming, existing, merger, baseOpts);
    // Should fall back to incoming (array-merged) — not the tiny LLM output
    expect(out).not.toContain("tiny merged body");
    expect(out).toContain("incoming body that is also pretty long");
  });

  it("rejects LLM output that has no frontmatter at all", async () => {
    const existing = PAGE("type: entity\ntitle: Foo", "old body content here");
    const incoming = PAGE("type: entity\ntitle: Foo", "new body content here");
    const merger = vi
      .fn()
      .mockResolvedValue(
        "raw markdown with no frontmatter at all and definitely no opening triple-dash",
      );
    const out = await mergePageContent(incoming, existing, merger, baseOpts);
    // Falls back to incoming — never writes frontmatter-less output to disk
    expect(out.startsWith("---")).toBe(true);
    expect(out).toContain("new body content here");
  });

  it("calls the optional backup callback when falling back", async () => {
    const existing = PAGE("type: entity\ntitle: Foo", "old body");
    const incoming = PAGE("type: entity\ntitle: Foo", "new body");
    const backup = vi.fn().mockResolvedValue(undefined);
    const merger = vi.fn().mockRejectedValue(new Error("network error"));
    await mergePageContent(incoming, existing, merger, {
      ...baseOpts,
      backup,
    });
    expect(backup).toHaveBeenCalledWith(existing);
  });

  it("does not call backup when LLM merge succeeds", async () => {
    const existing = PAGE("type: entity\ntitle: Foo", "old body");
    const incoming = PAGE("type: entity\ntitle: Foo", "new body content");
    const backup = vi.fn().mockResolvedValue(undefined);
    const merger = vi
      .fn()
      .mockResolvedValue(
        PAGE(
          "type: entity\ntitle: Foo",
          "merged body that is long enough to clear the threshold check",
        ),
      );
    await mergePageContent(incoming, existing, merger, {
      ...baseOpts,
      backup,
    });
    expect(backup).not.toHaveBeenCalled();
  });

  it("backup failure is swallowed (best-effort, never blocks the write)", async () => {
    const existing = PAGE("type: entity\ntitle: Foo", "old body");
    const incoming = PAGE("type: entity\ntitle: Foo", "new body content");
    const backup = vi.fn().mockRejectedValue(new Error("disk full"));
    const merger = vi.fn().mockRejectedValue(new Error("network error"));

    // Should still resolve — backup error must not propagate
    const out = await mergePageContent(incoming, existing, merger, {
      ...baseOpts,
      backup,
    });
    expect(out).toContain("new body content");
  });
});
