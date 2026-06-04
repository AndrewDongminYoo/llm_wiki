import { describe, expect, it } from "vitest"
import {
  parseWikiSchemaMarkdown,
  repairWikiPageToSchema,
  validateWikiPageAgainstSchema,
} from "./wiki-schema"

const TEAM_REMITED_SCHEMA = `# Wiki Schema

## Page Types

| Type       | Directory         | Purpose |
| ---------- | ----------------- | ------- |
| entity     | wiki/entities/    | Named things |
| concept    | wiki/concepts/    | Ideas |
| source     | wiki/sources/     | Source summaries |
| query      | wiki/queries/     | Open questions |
| comparison | wiki/comparisons/ | Comparisons |
| synthesis  | wiki/synthesis/   | Synthesis |
| business   | wiki/business/    | Product background |
| overview   | wiki/             | Project overview |

## Frontmatter

All pages must include YAML frontmatter:

\`\`\`yaml
---
type: entity | concept | source | query | comparison | synthesis | business | overview
title: Human-readable title
tags: []
related: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
\`\`\`

Source pages also include:

\`\`\`yaml
authors: []
year: YYYY
url: ""
venue: ""
\`\`\`

Business pages also include:

\`\`\`yaml
key: <original-kb-key>
aliases: []
status: active | paused | inactive
\`\`\`
`

describe("parseWikiSchemaMarkdown", () => {
  it("extracts type directories and type-specific required fields", () => {
    const schema = parseWikiSchemaMarkdown(TEAM_REMITED_SCHEMA)

    expect(schema.typeDirs.business).toBe("wiki/business")
    expect(schema.typeDirs.overview).toBe("wiki")
    expect(schema.baseRequiredFields).toEqual([
      "type",
      "title",
      "tags",
      "related",
      "created",
      "updated",
    ])
    expect(schema.requiredFieldsByType.source).toEqual([
      "authors",
      "year",
      "url",
      "venue",
    ])
    expect(schema.requiredFieldsByType.business).toEqual([
      "key",
      "aliases",
      "status",
    ])
  })
})

describe("validateWikiPageAgainstSchema", () => {
  const schema = parseWikiSchemaMarkdown(TEAM_REMITED_SCHEMA)

  it("reports missing required frontmatter and type-directory mismatch", () => {
    const issues = validateWikiPageAgainstSchema(
      "wiki/business/refrigerator-pick.md",
      [
        "---",
        "type: concept",
        "title: Refrigerator Pick",
        "created: 2026-06-05",
        "tags: []",
        "---",
        "",
        "# Refrigerator Pick",
      ].join("\n"),
      schema,
    )

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "frontmatter.missing",
        "page.location",
        "business.missing",
      ]),
    )
  })

  it("reports leaked FILE block markers inside a page body", () => {
    const issues = validateWikiPageAgainstSchema(
      "wiki/overview.md",
      [
        "---",
        "type: overview",
        "title: Project Overview",
        "tags: []",
        "related: []",
        "created: 2026-06-05",
        "updated: 2026-06-05",
        "---",
        "",
        "---FILE: wiki/overview.md---",
      ].join("\n"),
      schema,
    )

    expect(issues.some((issue) => issue.code === "file-block-marker")).toBe(true)
  })
})

describe("repairWikiPageToSchema", () => {
  const schema = parseWikiSchemaMarkdown(TEAM_REMITED_SCHEMA)

  it("adds missing standard query fields from the project schema", () => {
    const repaired = repairWikiPageToSchema(
      "wiki/queries/open-question.md",
      [
        "---",
        "type: query",
        "title: Open Question",
        "created: 2026-06-05",
        "tags: []",
        "---",
        "",
        "# Open Question",
      ].join("\n"),
      schema,
      { today: "2026-06-05" },
    )

    expect(repaired.content).toContain("updated: 2026-06-05")
    expect(repaired.content).toContain("related: []")
    expect(repaired.fatalIssues).toEqual([])
  })

  it("rejects pages with mismatched type and schema directory", () => {
    const repaired = repairWikiPageToSchema(
      "wiki/business/refrigerator-pick.md",
      [
        "---",
        "type: concept",
        "title: Refrigerator Pick",
        "tags: []",
        "related: []",
        "created: 2026-06-05",
        "updated: 2026-06-05",
        "---",
        "",
        "# Refrigerator Pick",
      ].join("\n"),
      schema,
      { today: "2026-06-05" },
    )

    expect(repaired.fatalIssues.map((issue) => issue.code)).toContain(
      "page.location",
    )
  })

  it("keeps non-repairable schema issues separate from repaired missing fields", () => {
    const repaired = repairWikiPageToSchema(
      "wiki/concepts/bad-tags.md",
      [
        "---",
        "type: concept",
        "title: Bad Tags",
        "tags: not-an-array",
        "related: []",
        "created: 2026-06-05",
        "---",
        "",
        "# Bad Tags",
      ].join("\n"),
      schema,
      { today: "2026-06-05" },
    )

    expect(repaired.content).toContain("updated: 2026-06-05")
    expect(repaired.repairedIssues.map((issue) => issue.message)).toContain(
      'Missing frontmatter field "updated".',
    )
    expect(repaired.unrepairedIssues.map((issue) => issue.message)).toContain(
      'Frontmatter "tags" must be an array.',
    )
  })
})
