import './style.css'

const TZ = 'America/Phoenix'
const VIEWER = {
  name: 'Fort Mohave, AZ',
  zip: '86426',
  lat: 35.0,
  lon: -114.6,
}

const LL_PATH =
  '/api/ll/2.2.0/launch/upcoming/?search=SpaceX&limit=20&mode=detailed'

/** @typedef {{ id: string, name: string, mission: string, vehicle: string, pad: string, site: string, net: Date|null, status: string, windowStart: string|null, windowEnd: string|null, webcast: string|null, vis: 'YES'|'MAYBE'|'NO', reason: string, direction: string|null }} Launch */

let filterMode = 'all'
/** @type {Launch[]} */
let launches = []
let countdownTimer = null
let dataSource = 'loading'

function $(sel, el = document) {
  return el.querySelector(sel)
}

function fmtPT(date, opts = {}) {
  if (!date) return 'TBD'
  const { year, weekday = 'short', ...rest } = opts
  const options = {
    timeZone: TZ,
    weekday,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
    ...rest,
  }
  if (year === true || year === 'numeric') options.year = 'numeric'
  else if (typeof year === 'string') options.year = year
  return new Intl.DateTimeFormat('en-US', options).format(date)
}

function fmtUTC(date) {
  if (!date) return 'TBD'
  return (
    date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
  )
}

function isPlaceholderNet(date, status) {
  if (!date) return true
  const s = (status || '').toLowerCase()
  if (!s.includes('determin') && !s.includes('to be')) return false
  return date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCDate() >= 28
}

function classifyVisibility(site, net) {
  const loc = (site || '').toLowerCase()
  let hour = null
  if (net) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(net)
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
    hour = h + m / 60
  }
  // Late Sep Fort Mohave: sunrise ~06:20, sunset ~18:30
  const nightish = hour != null && (hour < 6.25 || hour >= 18.5)
  const earlyDay = hour != null && hour >= 6.25 && hour < 8
  const day = hour != null && hour >= 8 && hour < 18.5

  if (loc.includes('vandenberg')) {
    const dir = 'WSW'
    if (nightish) {
      return {
        vis: 'YES',
        reason: 'Vandenberg · night/twilight · clear skies · look WSW (~250–300 mi)',
        direction: dir,
      }
    }
    if (earlyDay) {
      return {
        vis: 'MAYBE',
        reason: 'Vandenberg · just after sunrise (harder) · look WSW',
        direction: dir,
      }
    }
    if (day) {
      return {
        vis: 'MAYBE',
        reason: 'Vandenberg · daytime plume harder · look WSW',
        direction: dir,
      }
    }
    return {
      vis: 'MAYBE',
      reason: 'Vandenberg · check local twilight · look WSW',
      direction: dir,
    }
  }
  if (loc.includes('starbase') || loc.includes('boca chica')) {
    return {
      vis: 'NO',
      reason: 'Starbase TX ~1000+ mi — generally not visible',
      direction: null,
    }
  }
  if (
    loc.includes('cape canaveral') ||
    loc.includes('kennedy') ||
    loc.includes('florida')
  ) {
    return {
      vis: 'NO',
      reason: 'Florida pads ~2000+ mi — not practically visible',
      direction: null,
    }
  }
  return {
    vis: 'NO',
    reason: `Too far / unknown site (${site || '—'})`,
    direction: null,
  }
}

function normalizeLaunch(r) {
  const pad = r.pad || {}
  const loc = pad.location || {}
  const site = loc.name || ''
  const padName = pad.name || 'Unknown pad'
  const rocket =
    r.rocket?.configuration?.full_name ||
    r.rocket?.configuration?.name ||
    'Unknown'
  const name = r.name || 'Untitled'
  const mission = name.includes('|') ? name.split('|').slice(1).join('|').trim() : name
  const net = r.net ? new Date(r.net) : null
  const status = r.status?.name || 'Unknown'
  const vids = [...(r.vidURLs || []), ...(r.vid_urls || [])]
    .map((v) => (typeof v === 'string' ? v : v?.url))
    .filter(Boolean)
  const { vis, reason, direction } = classifyVisibility(site, net)
  return {
    id: r.id || name,
    name,
    mission,
    vehicle: rocket,
    pad: padName,
    site,
    net,
    status,
    windowStart: r.window_start || null,
    windowEnd: r.window_end || null,
    webcast: vids[0] || null,
    vis,
    reason,
    direction,
  }
}

async function fetchLaunches() {
  try {
    const res = await fetch(LL_PATH)
    if (!res.ok) throw new Error(`LL2 HTTP ${res.status}`)
    const data = await res.json()
    if (!data.results?.length) throw new Error('Empty results')
    dataSource = 'Launch Library 2 (live)'
    return data.results.map(normalizeLaunch)
  } catch (err) {
    console.warn('Live LL2 failed, using fallback:', err)
    const res = await fetch('/fallback-launches.json')
    if (!res.ok) throw err
    const data = await res.json()
    dataSource = 'Cached LL2 fallback (API unavailable)'
    return (data.results || []).map(normalizeLaunch)
  }
}

function pickFeatured(list) {
  const now = Date.now()
  const solid = list.filter((l) => l.net && !isPlaceholderNet(l.net, l.status))
  // Prefer next launch still ahead of T-0
  const upcoming = solid.filter((l) => l.net.getTime() > now)
  const goish = upcoming.find((l) => /go|confirmed|hold/i.test(l.status))
  if (goish) return goish
  if (upcoming[0]) return upcoming[0]
  // Recently in flight / just liftoff
  const recent = solid.find(
    (l) =>
      l.net.getTime() > now - 3 * 3600_000 &&
      /flight|go|success/i.test(l.status),
  )
  return recent || solid[0] || list[0] || null
}

function pickLookup(list) {
  const now = Date.now()
  const candidates = list.filter(
    (l) =>
      (l.vis === 'YES' || l.vis === 'MAYBE') &&
      l.net &&
      !isPlaceholderNet(l.net, l.status),
  )
  // Prefer upcoming YES, then upcoming MAYBE, then recent in-flight YES
  const upcoming = candidates.filter((l) => l.net.getTime() > now)
  const yesUp = upcoming.find((l) => l.vis === 'YES')
  if (yesUp) return yesUp
  const maybeUp = upcoming.find((l) => l.vis === 'MAYBE')
  if (maybeUp) return maybeUp
  const recentYes = candidates.find(
    (l) => l.vis === 'YES' && l.net.getTime() > now - 3 * 3600_000,
  )
  return recentYes || candidates[0] || null
}

function diffParts(target) {
  const ms = Math.max(0, target.getTime() - Date.now())
  const totalSec = Math.floor(ms / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return { d, h, m, s, past: target.getTime() < Date.now() }
}

function renderAppShell() {
  $('#app').innerHTML = `
    <header class="site-header">
      <div class="brand">
        <div class="brand-mark">SpaceX</div>
        <div class="brand-sub">Now · Fort Mohave</div>
      </div>
      <div class="viewer-meta">
        Viewer
        <strong>${VIEWER.name} · ${VIEWER.zip}</strong>
        ${VIEWER.lat.toFixed(1)}°N ${Math.abs(VIEWER.lon).toFixed(1)}°W · Times in PT
      </div>
    </header>
    <main class="wrap">
      <div id="hero" class="state-msg">Loading launches…</div>
      <div id="lookup"></div>
      <div class="toolbar">
        <div class="filters" role="tablist">
          <button type="button" class="filter-btn active" data-filter="all">All launches</button>
          <button type="button" class="filter-btn" data-filter="visible">Visible from Fort Mohave</button>
          <button type="button" class="filter-btn" data-filter="vandenberg">Vandenberg</button>
        </div>
        <div class="source-note" id="source-note"></div>
      </div>
      <p class="section-label">Upcoming</p>
      <div id="list" class="launch-list"></div>
    </main>
    <footer class="site-footer">
      Data · <a href="https://thespacedevs.com/" target="_blank" rel="noopener">The Space Devs Launch Library 2</a>
      · Visibility is a distance + day/night heuristic, not a trajectory sim
      · Unofficial fan schedule for Shawn Dutcher
    </footer>
  `

  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterMode = btn.dataset.filter
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      renderList()
    })
  })
}

function renderHero(featured) {
  const el = $('#hero')
  if (!featured) {
    el.className = 'state-msg'
    el.textContent = 'No upcoming SpaceX launches found.'
    return
  }
  el.className = 'hero'
  const statusClass = /flight/i.test(featured.status)
    ? 'in-flight'
    : /go/i.test(featured.status)
      ? 'go'
      : ''
  const timeLine = featured.net
    ? isPlaceholderNet(featured.net, featured.status)
      ? 'NET month TBD'
      : `${fmtPT(featured.net, { year: true })} · ${fmtUTC(featured.net)}`
    : 'NET TBD'

  el.innerHTML = `
    <p class="hero-kicker">Next tracked launch</p>
    <h1 class="hero-mission">${escapeHtml(featured.mission)}</h1>
    <p class="hero-meta">${escapeHtml(featured.vehicle)} · ${escapeHtml(featured.pad)} · ${escapeHtml(featured.site.replace(', USA', ''))}</p>
    <div class="countdown" id="countdown" aria-live="polite">
      <div class="cd-block"><div class="cd-num" data-u="d">--</div><div class="cd-unit">Days</div></div>
      <div class="cd-block"><div class="cd-num" data-u="h">--</div><div class="cd-unit">Hours</div></div>
      <div class="cd-block"><div class="cd-num" data-u="m">--</div><div class="cd-unit">Minutes</div></div>
      <div class="cd-block"><div class="cd-num" data-u="s">--</div><div class="cd-unit">Seconds</div></div>
    </div>
    <div class="hero-status ${statusClass}">${escapeHtml(featured.status)}</div>
    <p class="hero-meta" style="margin:1rem 0 0">${escapeHtml(timeLine)}</p>
  `

  if (countdownTimer) clearInterval(countdownTimer)
  const tick = () => {
    if (!featured.net || isPlaceholderNet(featured.net, featured.status)) {
      ;['d', 'h', 'm', 's'].forEach((u) => {
        const n = $(`#countdown [data-u="${u}"]`)
        if (n) n.textContent = '—'
      })
      return
    }
    const p = diffParts(featured.net)
    const map = { d: p.d, h: p.h, m: p.m, s: p.s }
    Object.entries(map).forEach(([u, v]) => {
      const n = $(`#countdown [data-u="${u}"]`)
      if (n) n.textContent = String(v).padStart(2, '0')
    })
  }
  tick()
  countdownTimer = setInterval(tick, 1000)
}

function renderLookup(candidate) {
  const el = $('#lookup')
  if (!candidate) {
    el.innerHTML = `
      <div class="lookup">
        <div>
          <p class="lookup-label">Look up · Fort Mohave</p>
          <p class="lookup-title">No clear visible candidate</p>
          <p class="lookup-detail">Watch for next night/twilight Vandenberg launch. Florida &amp; Starbase are not practical from here.</p>
        </div>
        <div class="lookup-compass">
          <div class="compass-dir">—</div>
          <div class="compass-sub">Direction</div>
        </div>
      </div>`
    return
  }
  const when = candidate.net
    ? fmtPT(candidate.net, { year: true })
    : 'TBD'
  el.innerHTML = `
    <div class="lookup">
      <div>
        <p class="lookup-label">Look up · Visible candidate · ${escapeHtml(candidate.vis)}</p>
        <p class="lookup-title">${escapeHtml(candidate.mission)}</p>
        <p class="lookup-detail">${escapeHtml(when)} · ${escapeHtml(candidate.pad)} · ${escapeHtml(candidate.reason)}</p>
      </div>
      <div class="lookup-compass">
        <div class="compass-dir">${escapeHtml(candidate.direction || '—')}</div>
        <div class="compass-sub">Look ${escapeHtml(candidate.direction || '—')}</div>
      </div>
    </div>`
}

function renderList() {
  const el = $('#list')
  const filtered = launches.filter((l) => {
    if (filterMode === 'visible') return l.vis === 'YES' || l.vis === 'MAYBE'
    if (filterMode === 'vandenberg')
      return (l.site || '').toLowerCase().includes('vandenberg')
    return true
  })

  if (!filtered.length) {
    el.innerHTML = `<div class="state-msg">No launches match this filter.</div>`
    return
  }

  el.innerHTML = filtered
    .map((l) => {
      const tbd = isPlaceholderNet(l.net, l.status)
      const pt = tbd
        ? (l.net
            ? new Intl.DateTimeFormat('en-US', {
                timeZone: TZ,
                month: 'short',
                year: 'numeric',
              }).format(l.net) + ' (day TBD)'
            : 'TBD')
        : fmtPT(l.net, { year: true })
      const utc = tbd ? 'Placeholder NET' : fmtUTC(l.net)
      return `
      <article class="launch-card" data-vis="${l.vis}">
        <div>
          <h2 class="lc-mission">${escapeHtml(l.mission)}</h2>
          <p class="lc-vehicle">${escapeHtml(l.vehicle)}</p>
        </div>
        <div>
          <p class="lc-pad">${escapeHtml(l.pad)}<br>${escapeHtml(l.site.replace(', USA', ''))}</p>
          <p class="lc-time">${escapeHtml(pt)}<span>${escapeHtml(utc)}</span></p>
        </div>
        <div class="lc-right">
          <span class="badge status">${escapeHtml(l.status)}</span>
          <span class="badge ${l.vis.toLowerCase()}">${l.vis}</span>
          <p class="vis-reason">${escapeHtml(l.reason)}</p>
        </div>
      </article>`
    })
    .join('')
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function boot() {
  renderAppShell()
  try {
    launches = await fetchLaunches()
    launches.sort((a, b) => (a.net?.getTime() ?? 0) - (b.net?.getTime() ?? 0))
    $('#source-note').textContent = dataSource
    const featured = pickFeatured(launches)
    const lookup = pickLookup(launches)
    renderHero(featured)
    renderLookup(lookup)
    renderList()
  } catch (e) {
    $('#hero').className = 'state-msg'
    $('#hero').textContent = `Failed to load launches: ${e.message}`
  }
}

boot()
