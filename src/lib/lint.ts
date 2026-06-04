import { readFile, listDirectory, fileExists } from "@/commands/fs"
import { streamChat } from "@/lib/llm-client"
import type { LlmConfig } from "@/stores/wiki-store"
import type { FileNode } from "@/types/wiki"
import { useActivityStore } from "@/stores/activity-store"
import { getFileName, getRelativePath, normalizePath } from "@/lib/path-utils"
import { buildLanguageDirective } from "@/lib/output-language"
import {
  loadProjectWikiSchema,
  validateWikiPageAgainstSchema,
} from "@/lib/wiki-schema"
import { parseFrontmatter } from "@/lib/frontmatter"

export interface LintResult {
  type: "orphan" | "broken-link" | "no-outlinks" | "schema" | "semantic"
  severity: "warning" | "info"
  page: string
  detail: string
  affectedPages?: string[]
}

// ── helpers ───────────────────────────────────────────────────────────────────

function flattenMdFiles(nodes: FileNode[]): FileNode[] {
  const files: FileNode[] = []
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      files.push(...flattenMdFiles(node.children))
    } else if (!node.is_dir && node.name.endsWith(".md")) {
      files.push(node)
    }
  }
  return files
}

function extractWikilinks(content: string): string[] {
  const links: string[] = []
  const regex = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim())
  }
  return links
}

function relativeToSlug(relativePath: string): string {
  // relativePath relative to wiki/ dir, e.g. "entities/foo-bar" or "queries/my-page-2024-01-01"
  return relativePath.replace(/\.md$/, "")
}

function wikilinkTargetToSlug(raw: string): string {
  const head = raw.split("|")[0]?.split("#")[0]?.trim() ?? ""
  const basename = head.includes("/")
    ? head.substring(head.lastIndexOf("/") + 1)
    : head
  return basename.replace(/\.md$/, "")
}

const URL_HOST_PATTERN = /^([a-z0-9][a-z0-9-]*\.)+[a-z]{2,}\b/i

function isCitationSource(value: string): boolean {
  const trimmed = value.trim()
  return (
    /^https?:\/\//.test(trimmed) ||
    /^\s*\[[^\]]+\]\([^)]+\)/.test(trimmed) ||
    /\s—\s/.test(trimmed) ||
    URL_HOST_PATTERN.test(trimmed)
  )
}

function parentDir(path: string): string {
  const normalized = normalizePath(path).replace(/\/+$/, "")
  const index = normalized.lastIndexOf("/")
  return index > 0 ? normalized.slice(0, index) : normalized
}

function sourcePathCandidates(projectPath: string, source: string): string[] {
  const pp = normalizePath(projectPath).replace(/\/+$/, "")
  const trimmed = source.trim().replace(/^\/+/, "")
  const candidates = new Set<string>()
  candidates.add(`${pp}/${trimmed}`)
  if (!trimmed.startsWith("raw/") && !trimmed.startsWith("wiki/")) {
    candidates.add(`${pp}/raw/sources/${trimmed}`)
    candidates.add(`${parentDir(pp)}/${trimmed}`)
  }
  return Array.from(candidates)
}

/**
 * Build a slug → absolute path map from wiki files. Keys are lowercased
 * so [[Transformer]] matches transformer.md — wikilink matching should
 * be case-insensitive (matching typical wiki conventions). Callers must
 * also lowercase their lookup keys.
 */
function buildSlugMap(
  wikiFiles: FileNode[],
  wikiRoot: string,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const f of wikiFiles) {
    // e.g. /path/to/project/wiki/entities/foo.md → entities/foo
    const rel = getRelativePath(f.path, wikiRoot).replace(/\.md$/, "")
    map.set(rel.toLowerCase(), f.path)
    // also index by basename without extension
    map.set(f.name.replace(/\.md$/, "").toLowerCase(), f.path)
  }
  return map
}

async function validateFrontmatterReferences(
  projectPath: string,
  page: string,
  content: string,
  knownSlugs: Set<string>,
): Promise<LintResult[]> {
  const parsed = parseFrontmatter(content)
  const fm = parsed.frontmatter
  if (!fm) return []

  const results: LintResult[] = []
  const related = fm.related
  if (Array.isArray(related)) {
    for (const target of related) {
      const slug = wikilinkTargetToSlug(target).toLowerCase()
      if (slug && !knownSlugs.has(slug)) {
        results.push({
          type: "schema",
          severity: "warning",
          page,
          detail: `Missing related page: "${target}"`,
        })
      }
    }
  }

  const sources = fm.sources
  if (Array.isArray(sources)) {
    for (const source of sources) {
      if (isCitationSource(source)) continue
      const trimmed = source.trim()
      if (!trimmed) continue

      if (/\.md$/i.test(trimmed) && !trimmed.includes("/")) {
        const slug = trimmed.replace(/\.md$/i, "").toLowerCase()
        if (knownSlugs.has(slug)) continue
      }

      let found = false
      for (const candidate of sourcePathCandidates(projectPath, trimmed)) {
        if (await fileExists(candidate)) {
          found = true
          break
        }
      }
      if (!found) {
        results.push({
          type: "schema",
          severity: "warning",
          page,
          detail: `Missing source path: "${source}"`,
        })
      }
    }
  }

  return results
}

interface OpenFence {
  char: "`" | "~"
  length: number
  lineNumber: number
}

function validateCodeFences(page: string, markdown: string): LintResult[] {
  const results: LintResult[] = []
  let openFence: OpenFence | null = null

  markdown.split("\n").forEach((line, index) => {
    const lineNumber = index + 1
    const match = line.match(/^(\s{0,3})(`{3,}|~{3,})(.*)$/)
    if (!match) return

    const fence = match[2]
    const rest = match[3].trim()
    const char = fence[0] as "`" | "~"
    const length = fence.length

    if (openFence) {
      const isClosingFence =
        char === openFence.char &&
        length >= openFence.length &&
        rest.length === 0
      if (isClosingFence) openFence = null
      return
    }

    const languageId = rest.split(/\s+/)[0] ?? ""
    if (!languageId) {
      results.push({
        type: "schema",
        severity: "warning",
        page,
        detail: `Line ${lineNumber}: fenced code block must specify a language id.`,
      })
      return
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(languageId)) {
      results.push({
        type: "schema",
        severity: "warning",
        page,
        detail: `Line ${lineNumber}: invalid code fence language id "${languageId}".`,
      })
    }

    openFence = { char, length, lineNumber }
  })

  const danglingFence = openFence as OpenFence | null
  if (danglingFence) {
    results.push({
      type: "schema",
      severity: "warning",
      page,
      detail: `Line ${danglingFence.lineNumber}: unclosed fenced code block.`,
    })
  }

  return results
}

// ── Structural lint ───────────────────────────────────────────────────────────

export async function runStructuralLint(projectPath: string): Promise<LintResult[]> {
  const pp = normalizePath(projectPath)
  const wikiRoot = `${pp}/wiki`
  let tree: FileNode[]
  try {
    tree = await listDirectory(wikiRoot)
  } catch {
    return []
  }

  const projectSchema = await loadProjectWikiSchema(pp)
  const wikiFiles = flattenMdFiles(tree)
  const knownSlugs = new Set(
    wikiFiles.map((f) => f.name.replace(/\.md$/, "").toLowerCase()),
  )
  // Exclude index.md and log.md from orphan checks
  const contentFiles = wikiFiles.filter(
    (f) => f.name !== "index.md" && f.name !== "log.md"
  )

  const slugMap = buildSlugMap(contentFiles, wikiRoot)

  // Read all content files
  type PageData = { path: string; slug: string; content: string; outlinks: string[] }
  const pages: PageData[] = []

  for (const f of contentFiles) {
    try {
      const content = await readFile(f.path)
      const slug = relativeToSlug(getRelativePath(f.path, wikiRoot))
      const outlinks = extractWikilinks(content)
      pages.push({ path: f.path, slug, content, outlinks })
    } catch {
      // skip unreadable files
    }
  }

  // Build inbound link count. Lookups are case-insensitive — [[Transformer]]
  // should match transformer.md (slug "transformer").
  const inboundCounts = new Map<string, number>()
  for (const p of pages) {
    for (const link of p.outlinks) {
      const lookup = link.toLowerCase()
      const target = slugMap.has(lookup)
        ? relativeToSlug(getRelativePath(slugMap.get(lookup)!, wikiRoot)).toLowerCase()
        : lookup
      inboundCounts.set(target, (inboundCounts.get(target) ?? 0) + 1)
    }
  }

  const results: LintResult[] = []

  for (const p of pages) {
    const shortName = getRelativePath(p.path, wikiRoot)
    const wikiRelativePath = `wiki/${shortName}`

    if (projectSchema) {
      const schemaIssues = validateWikiPageAgainstSchema(
        wikiRelativePath,
        p.content,
        projectSchema,
      )
      for (const issue of schemaIssues) {
        results.push({
          type: "schema",
          severity: "warning",
          page: shortName,
          detail: issue.message,
        })
      }
      const parsed = parseFrontmatter(p.content)
      results.push(...validateCodeFences(shortName, parsed.body))
      results.push(
        ...(await validateFrontmatterReferences(pp, shortName, p.content, knownSlugs)),
      )
    }

    // Orphan: no inbound links (lowercased slug for case-insensitive match)
    const inbound = inboundCounts.get(p.slug.toLowerCase()) ?? 0
    if (inbound === 0) {
      results.push({
        type: "orphan",
        severity: "info",
        page: shortName,
        detail: "No other pages link to this page.",
      })
    }

    // No outbound links
    if (p.outlinks.length === 0) {
      results.push({
        type: "no-outlinks",
        severity: "info",
        page: shortName,
        detail: "This page has no [[wikilink]] references to other pages.",
      })
    }

    // Broken links — case-insensitive matching.
    for (const link of p.outlinks) {
      const lookup = link.toLowerCase()
      const basename = getFileName(link).replace(/\.md$/, "").toLowerCase()
      const exists = slugMap.has(lookup) || slugMap.has(basename)
      if (!exists) {
        results.push({
          type: "broken-link",
          severity: "warning",
          page: shortName,
          detail: `Broken link: [[${link}]] — target page not found.`,
        })
      }
    }
  }

  if (projectSchema) {
    const indexFile = wikiFiles.find((f) => f.name === "index.md")
    if (!indexFile) {
      results.push({
        type: "schema",
        severity: "warning",
        page: "index.md",
        detail: "Missing wiki/index.md",
      })
    } else {
      try {
        const indexContent = await readFile(indexFile.path)
        const indexLinks = new Set(
          extractWikilinks(indexContent).map((link) =>
            wikilinkTargetToSlug(link).toLowerCase(),
          ),
        )
        for (const p of pages) {
          const parsed = parseFrontmatter(p.content)
          const type = Array.isArray(parsed.frontmatter?.type)
            ? null
            : parsed.frontmatter?.type
          if (type !== "entity" && type !== "concept") continue
          const slug = getFileName(p.path).replace(/\.md$/, "")
          if (!indexLinks.has(slug.toLowerCase())) {
            results.push({
              type: "schema",
              severity: "warning",
              page: "index.md",
              detail: `Missing ${type} page in index: [[${slug}]]`,
            })
          }
        }
      } catch {
        results.push({
          type: "schema",
          severity: "warning",
          page: "index.md",
          detail: "Missing wiki/index.md",
        })
      }
    }
  }

  return results
}

// ── Semantic lint ─────────────────────────────────────────────────────────────

const LINT_BLOCK_REGEX =
  /---LINT:\s*([^\n|]+?)\s*\|\s*([^\n|]+?)\s*\|\s*([^\n-]+?)\s*---\n([\s\S]*?)---END LINT---/g

export async function runSemanticLint(
  projectPath: string,
  llmConfig: LlmConfig,
): Promise<LintResult[]> {
  const pp = normalizePath(projectPath)
  const activity = useActivityStore.getState()
  const activityId = activity.addItem({
    type: "lint",
    title: "Semantic wiki lint",
    status: "running",
    detail: "Reading wiki pages...",
    filesWritten: [],
  })

  const wikiRoot = `${pp}/wiki`
  let tree: FileNode[]
  try {
    tree = await listDirectory(wikiRoot)
  } catch {
    activity.updateItem(activityId, { status: "error", detail: "Failed to read wiki directory." })
    return []
  }

  const wikiFiles = flattenMdFiles(tree).filter(
    (f) => f.name !== "log.md"
  )

  // Build a compact summary of each page (frontmatter + first 500 chars)
  const summaries: string[] = []
  for (const f of wikiFiles) {
    try {
      const content = await readFile(f.path)
      const preview = content.slice(0, 500) + (content.length > 500 ? "..." : "")
      const shortPath = getRelativePath(f.path, wikiRoot)
      summaries.push(`### ${shortPath}\n${preview}`)
    } catch {
      // skip
    }
  }

  if (summaries.length === 0) {
    activity.updateItem(activityId, { status: "done", detail: "No wiki pages to lint." })
    return []
  }

  activity.updateItem(activityId, { detail: "Running LLM semantic analysis..." })

  // For auto-mode language detection, sample the concatenated summaries
  // so non-English wikis get a matching language directive.
  const summarySample = summaries.join("\n").slice(0, 2000)

  const prompt = [
    "You are a wiki quality analyst. Review the following wiki page summaries and identify issues.",
    "",
    buildLanguageDirective(summarySample),
    "",
    "For each issue, output exactly this format:",
    "",
    "---LINT: type | severity | Short title---",
    "Description of the issue.",
    "PAGES: page1.md, page2.md",
    "---END LINT---",
    "",
    "Types:",
    "- contradiction: two or more pages make conflicting claims",
    "- stale: information that appears outdated or superseded",
    "- missing-page: an important concept is heavily referenced but has no dedicated page",
    "- suggestion: a question or source worth adding to the wiki",
    "",
    "Severities:",
    "- warning: should be addressed",
    "- info: nice to have",
    "",
    "Only report genuine issues. Do not invent problems. Output ONLY the ---LINT--- blocks, no other text.",
    "",
    "## Wiki Pages",
    "",
    summaries.join("\n\n"),
  ].join("\n")

  let raw = ""
  let hadError = false

  await streamChat(
    llmConfig,
    [{ role: "user", content: prompt }],
    {
      onToken: (token) => { raw += token },
      onDone: () => {},
      onError: (err) => {
        hadError = true
        activity.updateItem(activityId, {
          status: "error",
          detail: `LLM error: ${err.message}`,
        })
      },
    },
  )

  if (hadError) return []

  const results: LintResult[] = []
  const matches = raw.matchAll(LINT_BLOCK_REGEX)

  for (const match of matches) {
    const rawType = match[1].trim().toLowerCase()
    const severity = match[2].trim().toLowerCase()
    const title = match[3].trim()
    const body = match[4].trim()

    // semantic results always use type "semantic"
    void rawType

    const pagesMatch = body.match(/^PAGES:\s*(.+)$/m)
    const affectedPages = pagesMatch
      ? pagesMatch[1].split(",").map((p) => p.trim())
      : undefined

    const detail = body.replace(/^PAGES:.*$/m, "").trim()

    results.push({
      type: "semantic",
      severity: (severity === "warning" ? "warning" : "info") as LintResult["severity"],
      page: title,
      detail: `[${rawType}] ${detail}`,
      affectedPages,
    })
  }

  activity.updateItem(activityId, {
    status: "done",
    detail: `Found ${results.length} semantic issue(s).`,
  })

  return results
}
