import { readFile } from "@/commands/fs"
import { parseFrontmatter } from "./frontmatter"
import { inferWikiTypeFromPath } from "./wiki-page-types"

export interface WikiSchemaSpec {
  typeDirs: Record<string, string>
  baseRequiredFields: string[]
  requiredFieldsByType: Record<string, string[]>
}

export interface WikiSchemaIssue {
  code: string
  message: string
  fatal?: boolean
}

interface RepairOptions {
  today?: string
}

interface RepairResult {
  content: string
  fatalIssues: WikiSchemaIssue[]
  repairedIssues: WikiSchemaIssue[]
  unrepairedIssues: WikiSchemaIssue[]
}

const DEFAULT_BASE_REQUIRED = ["type", "title", "tags", "related", "created", "updated"]

export async function loadProjectWikiSchema(
  projectPath: string,
): Promise<WikiSchemaSpec | null> {
  let raw = ""
  try {
    raw = await readFile(`${projectPath.replace(/\/+$/, "")}/schema.md`)
  } catch {
    return null
  }
  if (!raw.trim()) return null

  const schema = parseWikiSchemaMarkdown(raw)
  if (
    Object.keys(schema.typeDirs).length === 0 &&
    schema.baseRequiredFields.length === 0 &&
    Object.keys(schema.requiredFieldsByType).length === 0
  ) {
    return null
  }
  return schema
}

export function parseWikiSchemaMarkdown(markdown: string): WikiSchemaSpec {
  return {
    typeDirs: parseTypeDirs(markdown),
    baseRequiredFields: parseBaseRequiredFields(markdown),
    requiredFieldsByType: parseTypeSpecificRequiredFields(markdown),
  }
}

export function validateWikiPageAgainstSchema(
  relativePath: string,
  content: string,
  schema: WikiSchemaSpec,
): WikiSchemaIssue[] {
  const issues: WikiSchemaIssue[] = []
  const normalizedPath = normalizeRelativePath(relativePath)

  if (/---\s*FILE:/i.test(content) || /---\s*END\s+FILE\s*---/i.test(content)) {
    issues.push({
      code: "file-block-marker",
      message: "Page content contains leaked FILE block markers.",
      fatal: true,
    })
  }

  const parsed = parseFrontmatter(content)
  if (!parsed.frontmatter) {
    issues.push({
      code: "frontmatter.parse",
      message: "Page is missing parseable YAML frontmatter.",
      fatal: true,
    })
    return issues
  }

  const fm = parsed.frontmatter
  const type = asString(fm.type)
  if (!type) {
    issues.push({
      code: "frontmatter.missing",
      message: 'Missing frontmatter field "type".',
    })
  } else if (Object.keys(schema.typeDirs).length > 0 && !schema.typeDirs[type]) {
    issues.push({
      code: "frontmatter.type",
      message: `Unknown page type "${type}" for this project schema.`,
      fatal: true,
    })
  }

  for (const field of schema.baseRequiredFields.length > 0
    ? schema.baseRequiredFields
    : DEFAULT_BASE_REQUIRED) {
    if (fm[field] === undefined || fm[field] === "") {
      issues.push({
        code: "frontmatter.missing",
        message: `Missing frontmatter field "${field}".`,
      })
    }
  }

  const pathType = inferTypeFromSchemaPath(normalizedPath, schema)
  const requiredTypes = Array.from(new Set([type, pathType].filter(Boolean))) as string[]
  for (const requiredType of requiredTypes) {
    const requiredForType = schema.requiredFieldsByType[requiredType] ?? []
    for (const field of requiredForType) {
      if (fm[field] === undefined || fm[field] === "") {
        issues.push({
          code: `${requiredType}.missing`,
          message: `Missing ${requiredType} frontmatter field "${field}".`,
        })
      }
    }
  }

  validateArrayField(fm, "tags", issues)
  validateArrayField(fm, "related", issues)

  if (type === "source") {
    validateArrayField(fm, "authors", issues)
    validateYearField(fm, "year", issues)
  }
  if (type === "business") {
    validateArrayField(fm, "aliases", issues)
  }

  validateDateField(fm, "created", issues)
  validateDateField(fm, "updated", issues)

  const created = asString(fm.created)
  const updated = asString(fm.updated)
  if (created && updated && /^\d{4}-\d{2}-\d{2}/.test(created) && /^\d{4}-\d{2}-\d{2}/.test(updated)) {
    if (updated.slice(0, 10) < created.slice(0, 10)) {
      issues.push({
        code: "frontmatter.date",
        message: 'Frontmatter "updated" must be greater than or equal to "created".',
      })
    }
  }

  if (type && schema.typeDirs[type]) {
    const expectedDir = stripTrailingSlash(schema.typeDirs[type])
    const actualDir = dirname(normalizedPath)
    if (type === "overview") {
      if (actualDir !== "wiki") {
        issues.push({
          code: "page.location",
          message: `Overview pages must be directly under "wiki/". Current directory: "${actualDir}".`,
          fatal: true,
        })
      }
    } else if (actualDir !== expectedDir) {
      issues.push({
        code: "page.location",
        message: `Page type "${type}" must be under "${expectedDir}/". Current directory: "${actualDir}".`,
        fatal: true,
      })
    }
  }

  return issues
}

export function repairWikiPageToSchema(
  relativePath: string,
  content: string,
  schema: WikiSchemaSpec,
  options: RepairOptions = {},
): RepairResult {
  const initialIssues = validateWikiPageAgainstSchema(relativePath, content, schema)
  const fatalIssues = initialIssues.filter((issue) => issue.fatal)
  if (fatalIssues.length > 0) {
    return { content, fatalIssues, repairedIssues: [], unrepairedIssues: [] }
  }

  const parsed = parseFrontmatter(content)
  if (!parsed.frontmatter) {
    return {
      content,
      fatalIssues: [
        {
          code: "frontmatter.parse",
          message: "Page is missing parseable YAML frontmatter.",
          fatal: true,
        },
      ],
      repairedIssues: [],
      unrepairedIssues: [],
    }
  }

  const today = options.today ?? new Date().toISOString().slice(0, 10)
  const type = asString(parsed.frontmatter.type) ?? inferWikiTypeFromPath(relativePath)
  const fields = new Map<string, string>()
  const repairableIssues: WikiSchemaIssue[] = []

  for (const issue of initialIssues) {
    const match = issue.message.match(/field "([^"]+)"/)
    const field = match?.[1]
    if (!field || parsed.frontmatter[field] !== undefined) continue
    fields.set(field, defaultFieldValue(field, type, relativePath, today, content))
    repairableIssues.push(issue)
  }

  const repairedContent =
    fields.size > 0 ? appendMissingFrontmatterFields(content, fields) : content
  const remainingIssues = validateWikiPageAgainstSchema(
    relativePath,
    repairedContent,
    schema,
  )

  return {
    content: repairedContent,
    fatalIssues: remainingIssues.filter((issue) => issue.fatal),
    repairedIssues: repairableIssues,
    unrepairedIssues: remainingIssues.filter((issue) => !issue.fatal),
  }
}

function parseTypeDirs(markdown: string): Record<string, string> {
  const typeDirs: Record<string, string> = {}
  for (const line of markdown.split("\n")) {
    if (!line.trim().startsWith("|")) continue
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim())
    if (cells.length < 2) continue
    const [type, dir] = cells
    if (!/^[a-z][a-z0-9_-]*$/i.test(type)) continue
    if (!dir.startsWith("wiki/") && dir !== "wiki") continue
    typeDirs[type] = stripTrailingSlash(dir)
  }
  return typeDirs
}

function inferTypeFromSchemaPath(
  relativePath: string,
  schema: WikiSchemaSpec,
): string | null {
  const actualDir = dirname(relativePath)
  for (const [type, dir] of Object.entries(schema.typeDirs)) {
    const expected = stripTrailingSlash(dir)
    if (type === "overview" && actualDir === "wiki") return type
    if (actualDir === expected) return type
  }
  return null
}

function parseBaseRequiredFields(markdown: string): string[] {
  const block = extractYamlBlockAfter(markdown, /All pages must include YAML frontmatter:/i)
  return block ? frontmatterKeysFromYamlBlock(block) : []
}

function parseTypeSpecificRequiredFields(markdown: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const re = /^([A-Z][A-Za-z0-9_-]*) pages also include:\s*$/gim
  let match: RegExpExecArray | null
  while ((match = re.exec(markdown)) !== null) {
    const type = match[1].toLowerCase()
    const block = extractYamlBlockAfter(markdown.slice(match.index), /pages also include:/i)
    if (!block) continue
    out[type] = frontmatterKeysFromYamlBlock(block)
  }
  return out
}

function extractYamlBlockAfter(markdown: string, marker: RegExp): string | null {
  const markerMatch = marker.exec(markdown)
  if (!markerMatch || markerMatch.index === undefined) return null
  const after = markdown.slice(markerMatch.index + markerMatch[0].length)
  const blockMatch = after.match(/```(?:yaml|yml)?\s*\n([\s\S]*?)\n```/)
  return blockMatch?.[1] ?? null
}

function frontmatterKeysFromYamlBlock(block: string): string[] {
  const keys: string[] = []
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim()
    if (!line || line === "---" || line.startsWith("#")) continue
    const match = line.match(/^([A-Za-z_][\w-]*)\s*:/)
    if (match) keys.push(match[1])
  }
  return keys
}

function appendMissingFrontmatterFields(content: string, fields: Map<string, string>): string {
  const match = content.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)
  if (!match || match.index !== 0) return content
  const insert = Array.from(fields.entries())
    .map(([field, value]) => `${field}: ${value}`)
    .join("\n")
  const rawBlock = match[0]
  const lineEnding = rawBlock.includes("\r\n") ? "\r\n" : "\n"
  const trailingNewline = rawBlock.endsWith("\r\n")
    ? "\r\n"
    : rawBlock.endsWith("\n")
      ? "\n"
      : ""
  const blockWithoutTrailingNewline = trailingNewline
    ? rawBlock.slice(0, -trailingNewline.length)
    : rawBlock
  const replacement =
    blockWithoutTrailingNewline.replace(
      /\r?\n---[ \t]*$/,
      `${lineEnding}${insert}${lineEnding}---`,
    ) + trailingNewline
  return replacement + content.slice(rawBlock.length)
}

function defaultFieldValue(
  field: string,
  type: string | null,
  relativePath: string,
  today: string,
  content: string,
): string {
  if (field === "type") return type ?? inferWikiTypeFromPath(relativePath) ?? "concept"
  if (field === "title") return quoteYaml(deriveTitle(relativePath, content))
  if (field === "created" || field === "updated") return today
  if (["tags", "related", "sources", "authors", "aliases"].includes(field)) return "[]"
  if (field === "year") return today.slice(0, 4)
  if (field === "url" || field === "venue") return '""'
  if (field === "status") return "active"
  if (field === "key") return slugFromPath(relativePath)
  return '""'
}

function deriveTitle(relativePath: string, content: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
  if (heading) return heading
  return slugFromPath(relativePath)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function slugFromPath(relativePath: string): string {
  return normalizeRelativePath(relativePath).split("/").pop()?.replace(/\.md$/, "") ?? "untitled"
}

function validateArrayField(
  fm: Record<string, string | string[]>,
  field: string,
  issues: WikiSchemaIssue[],
) {
  const value = fm[field]
  if (value !== undefined && !Array.isArray(value)) {
    issues.push({
      code: "frontmatter.type",
      message: `Frontmatter "${field}" must be an array.`,
    })
  }
}

function validateDateField(
  fm: Record<string, string | string[]>,
  field: string,
  issues: WikiSchemaIssue[],
) {
  const value = asString(fm[field])
  if (value !== undefined && !/^\d{4}-\d{2}-\d{2}/.test(value)) {
    issues.push({
      code: "frontmatter.date",
      message: `Frontmatter "${field}" must be YYYY-MM-DD or ISO datetime.`,
    })
  }
}

function validateYearField(
  fm: Record<string, string | string[]>,
  field: string,
  issues: WikiSchemaIssue[],
) {
  const value = asString(fm[field])
  if (value !== undefined && !/^\d{4}$/.test(value)) {
    issues.push({
      code: "frontmatter.year",
      message: `Frontmatter "${field}" must be a four-digit year.`,
    })
  }
}

function asString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? undefined : value
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\/+/, "")
}

function dirname(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath)
  const index = normalized.lastIndexOf("/")
  return index >= 0 ? normalized.slice(0, index) : "."
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

function quoteYaml(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}
