/**
 * Pure formatting helpers that turn raw Zotero API payloads into compact,
 * model-friendly values. Library content is DATA, never instructions — these
 * helpers deliberately collapse HTML notes to plain text so nothing markup-ish
 * survives into the model transcript.
 */

export interface FormatOptions {
  /** Abstract preview length in search results; 0 omits abstracts entirely. */
  abstractPreviewChars: number
}

export function truncate(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined
  const flat = value.trim()
  if (max <= 0 || flat.length <= max) return flat || undefined
  return `${flat.slice(0, max)}…`
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Collapse a Zotero note (HTML) to readable plain text. */
export function stripHtml(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d|li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
  const withoutTags = withBreaks.replace(/<[^>]+>/g, '')
  return withoutTags
    .replaceAll(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Extract a 4-digit year from Zotero's loose `date` field. */
export function extractYear(date: string | undefined): number | undefined {
  const match = date?.match(/\d{4}/)
  return match ? Number(match[0]) : undefined
}

export interface RawCreator {
  creatorType?: string
  firstName?: string
  lastName?: string
  name?: string
}

/** "Last, F.; Last2, F2.; …" — first 3 creators, then a "+N" tail. */
export function formatCreators(creators: RawCreator[] | undefined, max = 3): string | undefined {
  if (!creators?.length) return undefined
  const rendered = creators.map((creator) => {
    if (creator.name) return creator.name
    const parts = [creator.lastName, creator.firstName].filter(Boolean)
    return parts.join(', ')
  }).filter(Boolean)
  if (rendered.length === 0) return undefined
  const head = rendered.slice(0, max).join('; ')
  return rendered.length > max ? `${head} +${rendered.length - max}` : head
}

function tagNames(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const names = raw
    .map((tag) => typeof tag === 'string' ? tag : (tag as { tag?: string })?.tag)
    .filter((tag): tag is string => Boolean(tag))
  return names.length > 0 ? names : undefined
}

/** Compact projection of one item for search/list results. */
export function compactItem(raw: any, options: FormatOptions): Record<string, unknown> {
  const data = raw?.data ?? {}
  const title = data.title ?? data.name ?? data.subject
  return {
    key: raw?.key,
    itemType: data.itemType,
    title,
    creators: formatCreators(data.creators),
    year: extractYear(data.date),
    date: data.date || undefined,
    publicationTitle: data.publicationTitle || data.proceedingsTitle || data.bookTitle || undefined,
    doi: data.DOI || undefined,
    url: data.url || undefined,
    abstract: truncate(data.abstractNote, options.abstractPreviewChars),
    tags: tagNames(data.tags),
    collections: Array.isArray(data.collections) && data.collections.length > 0 ? data.collections : undefined,
    dateAdded: data.dateAdded || undefined,
    creatorSummary: raw?.meta?.creatorSummary || undefined,
  }
}

/** Attachment projection; `path` keeps Zotero's `storage:…` prefix for imported files. */
export function attachmentInfo(raw: any): Record<string, unknown> {
  const data = raw?.data ?? {}
  return {
    key: raw?.key,
    title: data.title,
    contentType: data.contentType || undefined,
    linkMode: data.linkMode || undefined,
    filename: data.filename || undefined,
    path: data.path || undefined,
    url: data.url || undefined,
  }
}

/** Child-note projection: plain text keeps the model safe from embedded markup. */
export function noteInfo(raw: any): Record<string, unknown> {
  const data = raw?.data ?? {}
  const html = typeof data.note === 'string' ? data.note : ''
  return {
    key: raw?.key,
    text: truncate(stripHtml(html), 4000),
    parentItem: data.parentItem || undefined,
    dateAdded: data.dateAdded || undefined,
  }
}
