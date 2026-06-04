import { describe, expect, it } from "vitest"
import { buildWikiFrontmatter } from "./wiki-frontmatter"

describe("buildWikiFrontmatter", () => {
  it("writes the standard schema fields for query pages", () => {
    const frontmatter = buildWikiFrontmatter({
      type: "query",
      title: 'Android "less hazardous" claim',
      date: "2026-06-05",
      tags: [],
      related: [],
    })

    expect(frontmatter).toBe(
      [
        "---",
        'type: query',
        'title: "Android \\"less hazardous\\" claim"',
        "created: 2026-06-05",
        "updated: 2026-06-05",
        "tags: []",
        "related: []",
        "---",
        "",
      ].join("\n"),
    )
  })

  it("preserves simple scalar extras used by deep research", () => {
    const frontmatter = buildWikiFrontmatter({
      type: "query",
      title: "Research: SDK init",
      date: "2026-06-05",
      tags: ["research"],
      related: [],
      extra: { origin: "deep-research" },
    })

    expect(frontmatter).toContain("origin: deep-research")
    expect(frontmatter).toContain("updated: 2026-06-05")
    expect(frontmatter).toContain("related: []")
  })
})
