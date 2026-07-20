// Finds a kid-appropriate illustration for a learning topic — no API key needed.
//
// Uses Openverse (openly-licensed media) restricted to category=illustration and
// mature=false. Those filters alone are NOT enough for children — e.g. the canonical
// "human body" illustration is an anatomical nude that passes both. So we add a
// hard denylist: any query or result title touching anatomy / bodies / reproduction /
// nudity is refused outright, and that topic simply renders text-only. Safe topics
// (photosynthesis, the water cycle, fractions, a labelled heart diagram, …) still get
// a friendly picture. When in doubt we show no image rather than risk a wrong one.

// If any of these appear in the search query or a result's title, skip it.
const BLOCK = [
  'body', 'anatom', 'nude', 'naked', 'genital', 'penis', 'vagina', 'vulva',
  'scrotum', 'breast', 'nipple', 'buttock', 'reproduc', 'sperm', 'sexual',
  ' sex', 'sex ', 'puberty', 'menstru', 'pregnan', 'intercourse', 'torso',
  'figure showing', 'undress', 'bikini', 'lingerie', 'underwear',
]

function isRisky(text: string): boolean {
  const t = ` ${text.toLowerCase()} `
  return BLOCK.some(term => t.includes(term))
}

async function search(query: string): Promise<{ url: string; caption: string } | null> {
  const api =
    'https://api.openverse.org/v1/images/' +
    `?q=${encodeURIComponent(query)}&category=illustration&mature=false&page_size=6`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const res = await fetch(api, {
      signal: ctrl.signal,
      headers: { accept: 'application/json', 'user-agent': 'EduTeach/1.0 (school learning app)' },
    })
    if (!res.ok) return null
    const data = await res.json()
    const results = Array.isArray(data?.results) ? data.results : []
    for (const r of results) {
      const title = typeof r?.title === 'string' ? r.title : ''
      if (isRisky(title)) continue                      // reject risky result titles
      const url = typeof r?.url === 'string' ? r.url : (typeof r?.thumbnail === 'string' ? r.thumbnail : '')
      if (url) return { url, caption: title || query }
    }
    return null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchTopicImage(
  candidates: (string | undefined | null)[],
): Promise<{ url: string; caption: string } | null> {
  for (const raw of candidates) {
    const q = raw?.trim()
    if (!q || isRisky(q)) continue                      // never even search risky topics
    const hit = await search(q)
    if (hit) return hit
  }
  return null
}
