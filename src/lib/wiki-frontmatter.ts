export interface BuildWikiFrontmatterOptions {
  type: string
  title: string
  date: string
  tags?: string[]
  related?: string[]
  extra?: Record<string, string | string[]>
}

export function buildWikiFrontmatter({
  type,
  title,
  date,
  tags = [],
  related = [],
  extra = {},
}: BuildWikiFrontmatterOptions): string {
  const lines = [
    "---",
    `type: ${type}`,
    `title: ${quoteYamlString(title)}`,
    `created: ${date}`,
    `updated: ${date}`,
    `tags: ${formatArray(tags)}`,
    `related: ${formatArray(related)}`,
  ]

  for (const [key, value] of Object.entries(extra)) {
    lines.push(
      Array.isArray(value)
        ? `${key}: ${formatArray(value)}`
        : `${key}: ${formatScalar(value)}`,
    )
  }

  lines.push("---", "")
  return lines.join("\n")
}

function quoteYamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

function formatArray(values: string[]): string {
  if (values.length === 0) return "[]"
  return `[${values.map(formatScalar).join(", ")}]`
}

function formatScalar(value: string): string {
  if (/^[a-zA-Z0-9_.@/-]+$/.test(value)) return value
  return quoteYamlString(value)
}
