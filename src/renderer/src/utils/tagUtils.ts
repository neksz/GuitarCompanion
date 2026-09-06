import { IGuitarTab } from '../../../shared/types'

export interface TagColor {
  id: string
  name: string
  color: string
  bg: string
  border: string
}

export const PREDEFINED_TAG_COLORS: TagColor[] = [
  {
    id: 'blue',
    name: 'Blue',
    color: '#60a5fa',
    bg: 'rgba(96, 165, 250, 0.16)',
    border: 'rgba(96, 165, 250, 0.35)'
  },
  {
    id: 'purple',
    name: 'Purple',
    color: '#c084fc',
    bg: 'rgba(192, 132, 252, 0.16)',
    border: 'rgba(192, 132, 252, 0.35)'
  },
  {
    id: 'green',
    name: 'Green',
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.16)',
    border: 'rgba(52, 211, 153, 0.35)'
  },
  {
    id: 'orange',
    name: 'Orange',
    color: '#fbbf24',
    bg: 'rgba(251, 191, 36, 0.16)',
    border: 'rgba(251, 191, 36, 0.35)'
  },
  {
    id: 'rose',
    name: 'Rose',
    color: '#fb7185',
    bg: 'rgba(251, 113, 133, 0.16)',
    border: 'rgba(251, 113, 133, 0.35)'
  },
  {
    id: 'cyan',
    name: 'Cyan',
    color: '#22d3ee',
    bg: 'rgba(34, 211, 238, 0.16)',
    border: 'rgba(34, 211, 238, 0.35)'
  },
  {
    id: 'indigo',
    name: 'Indigo',
    color: '#818cf8',
    bg: 'rgba(129, 140, 248, 0.16)',
    border: 'rgba(129, 140, 248, 0.35)'
  },
  {
    id: 'teal',
    name: 'Teal',
    color: '#2dd4bf',
    bg: 'rgba(45, 212, 191, 0.16)',
    border: 'rgba(45, 212, 191, 0.35)'
  }
]

export interface TagInfo {
  name: string
  count: number
  color?: string
}

/**
 * Returns a TagColor based on explicit color ID/hex or deterministic hash from tag name.
 */
export function getTagColor(tagName: string, explicitColorIdOrHex?: string): TagColor {
  if (explicitColorIdOrHex) {
    const found = PREDEFINED_TAG_COLORS.find(
      (c) =>
        c.id.toLowerCase() === explicitColorIdOrHex.toLowerCase() ||
        c.color.toLowerCase() === explicitColorIdOrHex.toLowerCase()
    )
    if (found) return found
  }

  // Deterministic hash based on tag name
  let hash = 0
  for (let i = 0; i < tagName.length; i++) {
    hash = (hash << 5) - hash + tagName.charCodeAt(i)
    hash |= 0
  }
  const index = Math.abs(hash) % PREDEFINED_TAG_COLORS.length
  return PREDEFINED_TAG_COLORS[index]
}

/**
 * Extracts all unique tags from a list of tabs, counting usage frequency
 * and preserving any color associations, sorted by usage count descending.
 */
export function extractAllTags(tabs: IGuitarTab[]): TagInfo[] {
  const counts = new Map<string, number>()
  const colors = new Map<string, string>()

  for (const tab of tabs) {
    if (tab.name.toLowerCase().endsWith('.json')) continue
    const tags = tab.attributes?.tags
    const tagColors = tab.attributes?.tagColors

    if (Array.isArray(tags)) {
      for (const rawTag of tags) {
        if (typeof rawTag !== 'string') continue
        const name = rawTag.trim()
        if (!name) continue

        counts.set(name, (counts.get(name) || 0) + 1)
        if (tagColors && tagColors[name] && !colors.has(name)) {
          colors.set(name, tagColors[name])
        }
      }
    }
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({
      name,
      count,
      color: colors.get(name)
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
