import { describe, it, expect, beforeEach, vi } from "vitest"
import type { LlmConfig } from "@/stores/wiki-store"
import type { FileNode } from "@/types/wiki"

// Mock LLM + Tauri FS — the lint runner also touches the activity store
// (we leave that real so we can assert status transitions).
vi.mock("./llm-client", () => ({
  streamChat: vi.fn(),
}))
vi.mock("@/commands/fs", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  listDirectory: vi.fn(),
  fileExists: vi.fn(),
}))

import { runSemanticLint, runStructuralLint } from "./lint"
import { streamChat } from "./llm-client"
import { readFile, listDirectory, fileExists } from "@/commands/fs"
import { useWikiStore } from "@/stores/wiki-store"
import { useActivityStore } from "@/stores/activity-store"

const mockStreamChat = vi.mocked(streamChat)
const mockReadFile = vi.mocked(readFile)
const mockListDirectory = vi.mocked(listDirectory)
const mockFileExists = vi.mocked(fileExists)

function fakeLlmConfig(): LlmConfig {
  return {
    provider: "openai",
    apiKey: "k",
    model: "m",
    ollamaUrl: "",
    customEndpoint: "",
    maxContextSize: 128000,
  }
}

function makeFileNode(name: string, content: string): { node: FileNode; content: string } {
  return {
    node: {
      name,
      path: `/project/wiki/${name}`,
      is_dir: false,
      children: [],
    } as FileNode,
    content,
  }
}

beforeEach(() => {
  mockStreamChat.mockReset()
  mockReadFile.mockReset()
  mockListDirectory.mockReset()
  mockFileExists.mockReset()
  mockFileExists.mockResolvedValue(false)
  useWikiStore.getState().setOutputLanguage("auto")
  useActivityStore.setState({ items: [] })
})

describe("runSemanticLint — language directive", () => {
  it("uses explicit user setting", async () => {
    const pages = [
      makeFileNode("a.md", "Page A content here"),
      makeFileNode("b.md", "Page B content here"),
    ]
    mockListDirectory.mockResolvedValue(pages.map((p) => p.node))
    mockReadFile.mockImplementation(async (path) => {
      const match = pages.find((p) => p.node.path === path)
      return match?.content ?? ""
    })
    mockStreamChat.mockImplementation(async (_c, _m, cb) => {
      cb.onToken("")
      cb.onDone()
    })

    useWikiStore.getState().setOutputLanguage("Korean")
    await runSemanticLint("/project", fakeLlmConfig())

    const prompt = mockStreamChat.mock.calls[0][1][0].content
    expect(prompt).toContain("MANDATORY OUTPUT LANGUAGE: Korean")
  })

  it("auto mode detects from the concatenated page summaries", async () => {
    const cjkContent = "这是一篇关于注意力机制和神经网络的长中文页面"
    const pages = [
      makeFileNode("attention.md", cjkContent),
      makeFileNode("transformer.md", cjkContent),
    ]
    mockListDirectory.mockResolvedValue(pages.map((p) => p.node))
    mockReadFile.mockImplementation(async (path) => {
      const match = pages.find((p) => p.node.path === path)
      return match?.content ?? ""
    })
    mockStreamChat.mockImplementation(async (_c, _m, cb) => {
      cb.onToken("")
      cb.onDone()
    })

    useWikiStore.getState().setOutputLanguage("auto")
    await runSemanticLint("/project", fakeLlmConfig())

    const prompt = mockStreamChat.mock.calls[0][1][0].content
    expect(prompt).toContain("MANDATORY OUTPUT LANGUAGE: Chinese")
  })

  it("explicit setting wins over source language", async () => {
    const pages = [makeFileNode("x.md", "これは日本語の内容です")]
    mockListDirectory.mockResolvedValue(pages.map((p) => p.node))
    mockReadFile.mockResolvedValue(pages[0].content)
    mockStreamChat.mockImplementation(async (_c, _m, cb) => {
      cb.onToken("")
      cb.onDone()
    })

    useWikiStore.getState().setOutputLanguage("English")
    await runSemanticLint("/project", fakeLlmConfig())

    const prompt = mockStreamChat.mock.calls[0][1][0].content
    expect(prompt).toContain("MANDATORY OUTPUT LANGUAGE: English")
    expect(prompt).not.toContain("MANDATORY OUTPUT LANGUAGE: Japanese")
  })
})

describe("runSemanticLint — activity & early returns", () => {
  it("logs a running activity item and marks done", async () => {
    mockListDirectory.mockResolvedValue([makeFileNode("a.md", "content").node])
    mockReadFile.mockResolvedValue("content")
    mockStreamChat.mockImplementation(async (_c, _m, cb) => {
      cb.onDone()
    })

    await runSemanticLint("/project", fakeLlmConfig())
    const items = useActivityStore.getState().items
    expect(items).toHaveLength(1)
    // Final state after run completes
    expect(items[0].type).toBe("lint")
    expect(["done", "error"]).toContain(items[0].status)
  })

  it("returns empty and marks done when wiki has no pages", async () => {
    mockListDirectory.mockResolvedValue([])

    const result = await runSemanticLint("/project", fakeLlmConfig())
    expect(result).toEqual([])
    expect(mockStreamChat).not.toHaveBeenCalled()

    const items = useActivityStore.getState().items
    expect(items[0].detail).toMatch(/no wiki pages/i)
  })

  it("marks error status when wiki directory read fails", async () => {
    mockListDirectory.mockRejectedValue(new Error("ENOENT"))
    await runSemanticLint("/project", fakeLlmConfig())
    const items = useActivityStore.getState().items
    expect(items[0].status).toBe("error")
  })
})

describe("runStructuralLint — project schema", () => {
  it("reports frontmatter and directory violations when schema.md is present", async () => {
    const wikiTree = [
      {
        name: "business",
        path: "/project/wiki/business",
        is_dir: true,
        children: [
          {
            name: "refrigerator-pick.md",
            path: "/project/wiki/business/refrigerator-pick.md",
            is_dir: false,
            children: [],
          } as FileNode,
        ],
      } as FileNode,
      {
        name: "index.md",
        path: "/project/wiki/index.md",
        is_dir: false,
        children: [],
      } as FileNode,
    ]
    mockListDirectory.mockResolvedValue(wikiTree)
    mockReadFile.mockImplementation(async (path) => {
      if (path === "/project/schema.md") {
        return [
          "# Wiki Schema",
          "",
          "## Page Types",
          "",
          "| Type | Directory | Purpose |",
          "| ---- | --------- | ------- |",
          "| concept | wiki/concepts/ | Ideas |",
          "| business | wiki/business/ | Product background |",
          "",
          "## Frontmatter",
          "",
          "All pages must include YAML frontmatter:",
          "```yaml",
          "---",
          "type: concept | business",
          "title: Human-readable title",
          "tags: []",
          "related: []",
          "created: YYYY-MM-DD",
          "updated: YYYY-MM-DD",
          "---",
          "```",
          "",
          "Business pages also include:",
          "```yaml",
          "key: <original-kb-key>",
          "aliases: []",
          "status: active | paused | inactive",
          "```",
        ].join("\n")
      }
      if (path === "/project/wiki/index.md") {
        return "# Index\n"
      }
      return [
        "---",
        "type: concept",
        "title: Refrigerator Pick",
        "created: 2026-06-05",
        "tags: []",
        "---",
        "",
        "# Refrigerator Pick",
      ].join("\n")
    })

    const results = await runStructuralLint("/project")

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "schema",
          severity: "warning",
          page: "business/refrigerator-pick.md",
          detail: expect.stringContaining('Page type "concept" must be under "wiki/concepts/"'),
        }),
        expect.objectContaining({
          type: "schema",
          severity: "warning",
          page: "business/refrigerator-pick.md",
          detail: expect.stringContaining('Missing frontmatter field "updated"'),
        }),
      ]),
    )
  })

  it("reports unresolved related and sources frontmatter references", async () => {
    const wikiTree = [
      {
        name: "concepts",
        path: "/project/wiki/concepts",
        is_dir: true,
        children: [
          {
            name: "known.md",
            path: "/project/wiki/concepts/known.md",
            is_dir: false,
            children: [],
          } as FileNode,
          {
            name: "needs-refs.md",
            path: "/project/wiki/concepts/needs-refs.md",
            is_dir: false,
            children: [],
          } as FileNode,
        ],
      } as FileNode,
      {
        name: "index.md",
        path: "/project/wiki/index.md",
        is_dir: false,
        children: [],
      } as FileNode,
    ]
    mockListDirectory.mockResolvedValue(wikiTree)
    mockReadFile.mockImplementation(async (path) => {
      if (path === "/project/schema.md") {
        return [
          "# Wiki Schema",
          "",
          "## Page Types",
          "",
          "| Type | Directory | Purpose |",
          "| ---- | --------- | ------- |",
          "| concept | wiki/concepts/ | Ideas |",
          "",
          "## Frontmatter",
          "",
          "All pages must include YAML frontmatter:",
          "```yaml",
          "---",
          "type: concept",
          "title: Human-readable title",
          "tags: []",
          "related: []",
          "created: YYYY-MM-DD",
          "updated: YYYY-MM-DD",
          "---",
          "```",
        ].join("\n")
      }
      if (path === "/project/wiki/index.md") {
        return "- [[known]] — Known\n- [[needs-refs]] — Needs refs\n"
      }
      if (path === "/project/wiki/concepts/known.md") {
        return [
          "---",
          "type: concept",
          "title: Known",
          "tags: []",
          "related: [needs-refs]",
          "created: 2026-06-05",
          "updated: 2026-06-05",
          "---",
          "",
          "# Known",
          "",
          "See [[needs-refs]].",
        ].join("\n")
      }
      return [
        "---",
        "type: concept",
        "title: Needs Refs",
        "tags: []",
        "related: [missing-page]",
        "sources: [raw/sources/missing.md]",
        "created: 2026-06-05",
        "updated: 2026-06-05",
        "---",
        "",
        "# Needs Refs",
        "",
        "See [[known]].",
      ].join("\n")
    })

    const results = await runStructuralLint("/project")

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "schema",
          page: "concepts/needs-refs.md",
          detail: 'Missing related page: "missing-page"',
        }),
        expect.objectContaining({
          type: "schema",
          page: "concepts/needs-refs.md",
          detail: 'Missing source path: "raw/sources/missing.md"',
        }),
      ]),
    )
  })
})
