const https = require('https')
const { startDownload, cancelDownload } = require('./downloader')

/**
 * Spotify downloads — no spotdl or Spotify API required.
 *
 * Flow:
 *  1. Scrape the public Spotify page (JSON-LD structured data) for track title + artist
 *  2. Search YouTube Music via yt-dlp ytmsearch1: extractor
 *  3. Download + convert to MP3 using our bundled yt-dlp + ffmpeg
 *
 * This works entirely without Spotify credentials or a Premium account.
 */

/**
 * Fetch track metadata using Spotify's public oEmbed API.
 * No API key or authentication required — works for any public Spotify URL.
 *
 * oEmbed endpoint: https://open.spotify.com/oembed?url=SPOTIFY_URL
 * Returns JSON with title (track name), thumbnail_url (album art), etc.
 *
 * @param {string} url  Spotify track/album/playlist URL
 * @returns {Promise<{ title: string, artist: string, thumbnail: string|null, duration: string, platform: 'spotify' }>}
 */
/**
 * Fetch a URL and return the response body as a string.
 * Follows up to 5 redirects.
 */
function fetchHtml(url, headers = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('Too many redirects'))
    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href
        return resolve(fetchHtml(next, headers, redirectCount + 1))
      }
      let body = ''
      res.on('data', (c) => { body += c.toString() })
      res.on('end', () => resolve(body))
    })
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timed out')) })
    req.on('error', reject)
  })
}

/**
 * Fetch track metadata from Spotify using two strategies:
 *
 * 1. oEmbed API — gets track title + thumbnail (no auth needed)
 * 2. Embed page HTML — server-rendered, contains artist name in <title> and meta tags
 *
 * Combined they give us everything needed for a good YouTube search.
 */
function fetchSpotifyTrackInfo(url) {
  const cleanUrl = url.split('?')[0]

  // Extract track ID for the embed URL
  const trackIdMatch = cleanUrl.match(/\/track\/([A-Za-z0-9]+)/)
  const trackId = trackIdMatch ? trackIdMatch[1] : null

  const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(cleanUrl)}`
  const embedUrl  = trackId ? `https://open.spotify.com/embed/track/${trackId}` : null

  console.log(`[spotify] fetching info for: ${cleanUrl}`)

  const oembedHeaders = { 'User-Agent': 'Mozilla/5.0 (compatible; Wavdrop/1.0)', 'Accept': 'application/json' }
  const embedHeaders  = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9'
  }

  // Run both fetches in parallel
  const oembedPromise = fetchHtml(oembedUrl, oembedHeaders)
    .then(body => JSON.parse(body))
    .catch(() => null)

  const embedPromise = embedUrl
    ? fetchHtml(embedUrl, embedHeaders).catch(() => '')
    : Promise.resolve('')

  return Promise.all([oembedPromise, embedPromise]).then(([oembed, embedHtml]) => {
    // --- Title: from oEmbed ---
    const rawTitle = oembed?.title || 'Spotify Track'
    let title = rawTitle
    let artist = ''

    // oEmbed sometimes embeds artist: "Title - Artist"
    if (rawTitle.includes(' - ')) {
      const parts = rawTitle.split(' - ')
      title = parts[0].trim()
      artist = parts.slice(1).join(' - ').trim()
    }

    // --- Thumbnail: from oEmbed ---
    const thumbnail = oembed?.thumbnail_url || null

    // --- Artist: scrape the embed page HTML ---
    if (!artist && embedHtml) {
      console.log(`[spotify] embed HTML length: ${embedHtml.length}`)

      // Try meta author tag
      const authorMatch = embedHtml.match(/<meta\s+name="author"\s+content="([^"]+)"/)
      if (authorMatch) {
        artist = authorMatch[1].trim()
        console.log(`[spotify] artist from meta author: "${artist}"`)
      }

      // Try og:description "by Artist"
      if (!artist) {
        const ogDesc = (embedHtml.match(/<meta\s+(?:property|name)="(?:og:description|description)"\s+content="([^"]+)"/) || [])[1] || ''
        console.log(`[spotify] og:description: "${ogDesc}"`)
        const byMatch = ogDesc.match(/by ([^·•,\n]+)/i)
        if (byMatch) {
          artist = byMatch[1].trim()
          console.log(`[spotify] artist from og:description: "${artist}"`)
        }
      }

      // Try __NEXT_DATA__ JSON embedded by Next.js
      if (!artist) {
        const nextDataMatch = embedHtml.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
        if (nextDataMatch) {
          try {
            const nextData = JSON.parse(nextDataMatch[1])
            console.log(`[spotify] __NEXT_DATA__ keys:`, Object.keys(nextData?.props?.pageProps || {}))
            const entity = nextData?.props?.pageProps?.state?.data?.entity
            console.log(`[spotify] entity keys:`, entity ? Object.keys(entity) : 'none')
            if (entity?.artists?.[0]?.name) {
              artist = entity.artists[0].name
            } else if (entity?.data?.artists?.items?.[0]?.profile?.name) {
              artist = entity.data.artists.items[0].profile.name
            }
            if (artist) console.log(`[spotify] artist from __NEXT_DATA__: "${artist}"`)
          } catch (e) {
            console.log(`[spotify] __NEXT_DATA__ parse error:`, e.message)
          }
        } else {
          console.log(`[spotify] no __NEXT_DATA__ found in embed HTML`)
          // Log first 500 chars to see what we got
          console.log(`[spotify] embed HTML preview:`, embedHtml.slice(0, 500))
        }
      }
    }

    console.log(`[spotify] resolved → title="${title}" artist="${artist}"`)
    return { title, artist, thumbnail, duration: '', platform: 'spotify' }
  })
}

/**
 * Start a Spotify track download.
 * Scrapes the Spotify page for track info, then searches + downloads via yt-dlp YouTube Music.
 */
function startSpotifyDownload({ id, url, quality, outputPath, onProgress, onComplete, onError }) {
  console.log(`[spotify] fetching track info for: ${url}`)

  fetchSpotifyTrackInfo(url).then((info) => {
    // Build YouTube search query — "Artist - Title" gives best match
    const searchTerm = info.artist
      ? `${info.artist} - ${info.title}`
      : info.title
    const query = `ytsearch1:${searchTerm}`

    console.log(`[spotify] searching YouTube: "${query}"`)

    // Emit initial progress so the UI shows something
    onProgress({ id, percent: 0, message: `Finding: ${info.title}`, speed: null, eta: null })

    startDownload({
      id,
      url: query,
      quality,
      outputPath,
      onProgress,
      onComplete,
      onError,
      isSearch: true   // skip --no-playlist for search queries
    })
  }).catch((err) => {
    console.error('[spotify] failed to fetch track info:', err.message)
    onError({ id, message: `Could not load Spotify track info: ${err.message}` })
  })
}

/**
 * Cancel an active Spotify download (delegates to yt-dlp cancel).
 */
function cancelSpotifyDownload(id) {
  cancelDownload(id)
}

module.exports = { startSpotifyDownload, cancelSpotifyDownload, fetchSpotifyTrackInfo }
