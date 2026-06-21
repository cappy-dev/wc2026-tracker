const API_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';
const API_V2 = 'https://site.api.espn.com/apis/v2/sports/soccer/fifa.world';

const cache = new Map();
const CACHE_TTL = 60000;
const inflight = {};

function fetchWithDedup(url, signal) {
    const cached = cache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return Promise.resolve(cached.data);
    }
    if (inflight[url]) return inflight[url];
    const promise = fetch(url, { signal }).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    }).then(data => {
        cache.set(url, { data, timestamp: Date.now() });
        return data;
    }).finally(() => { delete inflight[url]; });
    inflight[url] = promise;
    return promise;
}

function formatStatus(comp) {
    const type = comp.status?.type?.name || '';
    const detail = comp.status?.type?.description || '';
    const tl = type.toLowerCase();
    if (tl.includes('in_progress') || tl.includes('live') || tl.includes('halftime') || tl.includes('second_half') || tl.includes('first_half') || (tl.includes('status_') && !tl.includes('scheduled') && !tl.includes('full_time') && !tl.includes('complete') && !tl.includes('postponed') && !tl.includes('canceled') && !tl.includes('suspended'))) {
        const clock = comp.status?.displayClock || '';
        return `<span class="status-live">${detail || 'LIVE'}${clock ? ' ' + clock : ''}</span>`;
    }
    if (tl.includes('complete') || tl.includes('full_time') || type === 'status_full_time') {
        return `<span class="status-ft">FT</span>`;
    }
    if (tl.includes('scheduled')) {
        const date = new Date(comp.date);
        const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
        const dateStr = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        return `<span class="status-scheduled">${dateStr} @ ${timeStr}</span>`;
    }
    return `<span class="status-ft">${detail || type}</span>`;
}

function gdClass(val) {
    const n = parseInt(val);
    if (n > 0) return 'gd-pos';
    if (n < 0) return 'gd-neg';
    return 'gd-zero';
}

function noteClass(note) {
    if (!note) return '';
    const d = (note.description || '').toLowerCase();
    const c = (note.color || '').toLowerCase();
    if (d.includes('advance') || c.includes('81d6ac')) return 'advance';
    if (d.includes('eliminated') || c.includes('e04545')) return 'eliminated';
    if (d.includes('best') || c.includes('f4a623')) return 'best8';
    return '';
}

const abortControllers = {};

function abortStale(key) {
    if (abortControllers[key]) {
        abortControllers[key].abort();
    }
    const controller = new AbortController();
    abortControllers[key] = controller;
    return controller.signal;
}

async function fetchStandings() {
    const container = document.getElementById('standings-container');
    if (!container) return;
    try {
        const signal = abortStale('standings');
        const data = await fetchWithDedup(`${API_V2}/standings`, signal);
        clearLoadingMessages('standings-container');
        if (!data.children || data.children.length === 0) {
            container.innerHTML = '<div class="no-data"><p>Standings not yet available</p></div>';
            return;
        }
        let html = '<div class="groups-grid">';
        for (const group of data.children) {
            const entries = group.standings?.entries || [];
            html += `<div class="group-card">`;
            html += `<div class="group-header">${group.name}</div>`;
            html += `<div style="overflow-x: auto; width: 100%; min-width: 300px;">
            <table class="standings-table">
            <tr>
                <th style="text-align:left">Team</th>
                <th>GP</th><th>W</th><th>D</th><th>L</th>
                <th>F</th><th>A</th><th>GD</th><th>Pts</th>
            </tr>`;
            for (const entry of entries) {
                const team = entry.team;
                const s = {};
                entry.stats.forEach(st => { s[st.name] = st.displayValue; });
                const note = entry.note || {};
                const nc = noteClass(note);
                const noteLabel = note.description || '';
                html += `<tr><td><div class="team-cell">
                    <img class="team-flag" src="${team.logos?.[0]?.href || ''}" alt="${team.displayName}" loading="lazy" onerror="this.style.display='none'">
                    ${team.displayName}
                </div></td>`;
                html += `<td>${s.gamesPlayed || '0'}</td>`;
                html += `<td>${s.wins || '0'}</td>`;
                html += `<td>${s.ties || '0'}</td>`;
                html += `<td>${s.losses || '0'}</td>`;
                html += `<td>${s.pointsFor || '0'}</td>`;
                html += `<td>${s.pointsAgainst || '0'}</td>`;
                html += `<td class="${gdClass(s.pointDifferential)}">${s.pointDifferential || '0'}</td>`;
                html += `<td style="font-weight:590;color:var(--fg)">${s.points || '0'}</td>`;
                html += `</tr>`;
                if (noteLabel) {
                    html += `<tr><td colspan="9" style="padding:2px 10px 6px;border-bottom:1px solid var(--border)">
                        <span class="${nc}">${noteLabel}</span>
                    </td></tr>`;
                }
            }
            html += `</table></div>`;
        }
        html += '</div>';
        container.innerHTML = html;
    } catch (e) {
        if (e.name === 'AbortError') return;
        clearLoadingMessages('standings-container');
        container.innerHTML = '<div class="error-box">Failed to load standings.</div>';
    }
}

let currentMatchDate = new Date();

function formatDateNav(d) {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function dateParam(d) {
    return d.getFullYear().toString() +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0');
}

function updateDateNav(d) {
    const el = document.getElementById('match-date-label');
    if (el) el.textContent = formatDateNav(d);
    const today = new Date();
    const prevBtn = document.getElementById('match-date-prev');
    const nextBtn = document.getElementById('match-date-next');
    if (prevBtn) prevBtn.style.visibility =
        d.toDateString() === today.toDateString() ? 'hidden' : 'visible';
    if (nextBtn) nextBtn.style.visibility =
        d.toDateString() === today.toDateString() ? 'hidden' : 'visible';
}

function goMatchDate(delta) {
    const newDate = new Date(currentMatchDate);
    newDate.setDate(newDate.getDate() + delta);
    if (newDate > new Date()) return;
    currentMatchDate = newDate;
    updateDateNav(currentMatchDate);
    const container = document.getElementById('matches-container');
    if (container) {
        container.innerHTML = '<div class="loading" role="status" aria-live="polite"><div class="spinner"></div><p>Loading matches...</p><div class="loading-msg"></div></div>';
        startLoadingMessages('matches-container', LOADING_MSGS.matches);
    }
    fetchMatches().catch(() => {});
}

async function fetchMatches() {
    const container = document.getElementById('matches-container');
    if (!container) return;
    try {
        const signal = abortStale('matches');
        const dateStr = dateParam(currentMatchDate);
        const data = await fetchWithDedup(`${API_BASE}/scoreboard?dates=${dateStr}`, signal);
        clearLoadingMessages('matches-container');
        const events = (data.events || []).filter(ev =>
            new Date(ev.date).toDateString() === currentMatchDate.toDateString());
        if (events.length === 0) {
            container.innerHTML = '<div class="no-data"><p>No matches on this date</p></div>';
            return;
        }
        let html = '<div class="matches-grid">';
        for (const ev of events) {
            const comp = ev.competitions?.[0];
            if (!comp) continue;
            const round = comp.round || {};
            const roundName = round.displayName || ev.status?.type?.description || 'Match';
            const competitors = comp.competitors || [];
            const scores = competitors.map(c => parseInt(c.score));
            const isDecided = scores.every(s => !isNaN(s)) && scores[0] !== scores[1];
            const winnerIdx = isDecided ? scores.indexOf(Math.max(...scores)) : -1;
            const venue = comp.venue || {};
            const venueParts = [venue.fullName, venue.address?.city].filter(Boolean);
            const venueStr = venueParts.length ? venueParts.join(', ') : '';
            const broadcast = comp.broadcasts?.[0]?.names?.join(', ') || '';
            const attendance = comp.attendance
                ? new Intl.NumberFormat().format(comp.attendance) + ' attending'
                : '';
            html += `<div class="match-card">`;
            html += `<div class="round">${roundName}</div>`;
            html += `<div class="match-teams">`;
            for (let i = 0; i < competitors.length; i++) {
                const competitor = competitors[i];
                const t = competitor.team;
                const scoreClass = i === winnerIdx ? ' class="score score--winner"' : ' class="score"';
                html += `<div class="match-team">
                    <div class="info">
                        <img class="team-flag" src="${t.logos?.[0]?.href || ''}" alt="${t.displayName}" loading="lazy" onerror="this.style.display='none'">
                        <span class="name">${t.displayName}</span>
                    </div>
                    <span${scoreClass}>${competitor.score || '–'}</span>
                </div>`;
            }
            html += `</div>`;
            html += `<div class="match-status">
                <span class="time">${new Date(comp.date).toLocaleDateString('en-US', {month:'short',day:'numeric'})}</span>
                ${formatStatus(comp)}
            </div>`;
            if (venueStr || broadcast || attendance) {
                html += `<div class="match-meta">${[venueStr, broadcast, attendance].filter(Boolean).join(' · ')}</div>`;
            }
            html += `</div>`;
        }
        html += '</div>';
        container.innerHTML = html;
    } catch (e) {
        if (e.name === 'AbortError') return;
        clearLoadingMessages('matches-container');
        container.innerHTML = '<div class="error-box">Failed to load matches.</div>';
    }
}

const SCORER_CATEGORIES = {
    goals: { stat: 'goalsLeaders', display: 'Goals', label: 'goals' },
    assists: { stat: 'assistsLeaders', display: 'Assists', label: 'assists' },
};
let currentScorerCategory = 'goals';

function switchScorerCategory(cat) {
    currentScorerCategory = cat;
    document.querySelectorAll('.scorer-tab').forEach(el => {
        el.classList.toggle('active', el.dataset.cat === cat);
    });
    const container = document.getElementById('scorers-container');
    if (container) {
        container.innerHTML = '<div class="loading" role="status" aria-live="polite"><div class="spinner"></div><p>Loading...</p><div class="loading-msg"></div></div>';
        startLoadingMessages('scorers-container', LOADING_MSGS.scorers);
    }
    fetchScorers().catch(() => {});
}

async function fetchScorers() {
    const container = document.getElementById('scorers-container');
    if (!container) return;
    try {
        const cat = SCORER_CATEGORIES[currentScorerCategory];
        const signal = abortStale('scorers');
        const data = await fetchWithDedup(`${API_BASE}/statistics`, signal);
        clearLoadingMessages('scorers-container');
        const statGroup = (data.stats || []).find(s => s.name === cat.stat);
        const leaders = statGroup?.leaders || [];
        if (leaders.length === 0) {
            container.innerHTML = '<div class="no-data"><p>No ' + cat.display.toLowerCase() + ' data yet</p></div>';
            return;
        }
        let html = '<div class="scorers-list">';
        for (let rank = 0; rank < leaders.length; rank++) {
            const leader = leaders[rank];
            const athlete = leader.athlete || {};
            const team = athlete.team || {};
            const value = leader.value || 0;
            const flagUrl = team.logos?.[0]?.href || '';
            const rankClass = rank === 0 ? ' scorer-row--leader' : '';
            html += `<div class="scorer-row${rankClass}">
                <div class="scorer-rank${rankClass ? ' scorer-rank--leader' : ''}">${rank + 1}</div>
                <img class="team-flag" src="${flagUrl}" alt="" loading="lazy" onerror="this.style.display='none'" style="width:28px;height:20px;">
                <div class="scorer-info">
                    <div class="scorer-name">${athlete.displayName || 'Unknown'}</div>
                    <div class="scorer-team">${team.displayName || ''}</div>
                </div>
                <div>
                    <div class="scorer-goals">${value}</div>
                    <div class="scorer-goals-label">${cat.label}</div>
                </div>
            </div>`;
        }
        html += '</div>';
        container.innerHTML = html;
    } catch (e) {
        if (e.name === 'AbortError') return;
        clearLoadingMessages('scorers-container');
        container.innerHTML = '<div class="error-box">Failed to load data.</div>';
    }
}

// Teams
async function fetchTeams() {
    const container = document.getElementById('teams-container');
    if (!container) return;
    try {
        const signal = abortStale('teams');
        const data = await fetchWithDedup(`${API_V2}/standings`, signal);
        clearLoadingMessages('teams-container');
        const teams = {};
        for (const group of data.children || []) {
            for (const entry of group.standings?.entries || []) {
                const t = entry.team;
                if (t && t.id && !teams[t.id]) teams[t.id] = t;
            }
        }
        const list = Object.values(teams);
        if (list.length === 0) {
            container.innerHTML = '<div class="no-data"><p>Teams not yet available</p></div>';
            return;
        }
        let html = '<div class="teams-grid">';
        for (const t of list) {
            const logo = t.logos?.[0]?.href || '';
            html += `<div class="team-card">
                <img class="team-card-logo" src="${logo}" alt="${t.displayName}" loading="lazy" onerror="this.style.display='none'">
                <div class="team-card-name">${t.displayName}</div>
                <div class="team-card-abbr">${t.abbreviation || ''}</div>
            </div>`;
        }
        html += '</div>';
        container.innerHTML = html;
    } catch (e) {
        if (e.name === 'AbortError') return;
        clearLoadingMessages('teams-container');
        container.innerHTML = '<div class="error-box">Failed to load teams.</div>';
    }
}

function initTeams() {
    startLoadingMessages('teams-container', LOADING_MSGS.teams);
    fetchTeams().catch(() => {});
}

const LOADING_MSGS = {
    standings: [
        'Loading group tables…',
        'Checking standings data…',
        'Reading match results…',
        'Looking up goal difference…',
    ],
    matches: [
        'Loading today\'s fixtures…',
        'Checking for live matches…',
        'Looking up schedules…',
    ],
    scorers: [
        'Loading scorer data…',
        'Checking goal counts…',
        'Looking up the Golden Boot race…',
    ],
    teams: [
        'Loading team data…',
        'Looking up team rosters…',
        'Gathering team info…',
    ],
};

const loadingIntervals = {};

function clearLoadingMessages(containerId) {
    if (loadingIntervals[containerId]) {
        clearInterval(loadingIntervals[containerId]);
        delete loadingIntervals[containerId];
    }
}

function startLoadingMessages(containerId, messages) {
    clearLoadingMessages(containerId);
    const container = document.getElementById(containerId);
    if (!container) return;
    const msgEl = container.querySelector('.loading-msg');
    if (!msgEl) return;
    let idx = 0;
    const rotate = () => {
        idx = (idx + 1) % messages.length;
        msgEl.style.opacity = 0;
        setTimeout(() => {
            msgEl.textContent = messages[idx];
            msgEl.style.opacity = 1;
        }, 150);
    };
    msgEl.textContent = messages[0];
    loadingIntervals[containerId] = setInterval(rotate, 4000);
}

// Theme toggle
const THEME_STORAGE_KEY = 'wc2026-theme';

function getPreferredTheme() {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function setTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    if (persist) localStorage.setItem(THEME_STORAGE_KEY, theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) {
        btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    setTheme(current === 'dark' ? 'light' : 'dark', true);
}

function initTheme() {
    setTheme(getPreferredTheme(), false);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', toggleTheme);
}

function initStandings() {
    startLoadingMessages('standings-container', LOADING_MSGS.standings);
    fetchStandings().catch(() => {});
    let timer = null;
    function refresh() { if (!document.hidden) fetchStandings().catch(() => {}); }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    timer = setInterval(refresh, 60000);
}

function initMatches() {
    currentMatchDate = new Date();
    updateDateNav(currentMatchDate);
    startLoadingMessages('matches-container', LOADING_MSGS.matches);
    fetchMatches().catch(() => {});
    let timer = null;
    function refresh() { if (!document.hidden) fetchMatches().catch(() => {}); }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    timer = setInterval(refresh, 60000);
}

function initScorers() {
    currentScorerCategory = 'goals';
    document.querySelectorAll('.scorer-tab').forEach(el => {
        el.addEventListener('click', () => switchScorerCategory(el.dataset.cat));
    });
    startLoadingMessages('scorers-container', LOADING_MSGS.scorers);
    fetchScorers().catch(() => {});
}

// News
async function fetchNews() {
    const container = document.getElementById('news-container');
    if (!container) return;
    try {
        const signal = abortStale('news');
        const data = await fetchWithDedup('https://now.core.api.espn.com/v1/sports/news?sport=soccer&leagues=fifa.world&limit=5', signal);
        clearLoadingMessages('news-container');
        const headlines = data.headlines || [];
        if (headlines.length === 0) {
            container.innerHTML = '<div class="no-data"><p>No news at this time</p></div>';
            return;
        }
        let html = '';
        for (const item of headlines) {
            const img = item.images?.[0];
            const imgUrl = img?.url || '';
            const link = item.links?.web?.href || '';
            html += `<a class="news-card" href="${link}" target="_blank" rel="noopener">
                ${imgUrl ? `<img class="news-img" src="${imgUrl}" alt="" loading="lazy">` : ''}
                <div class="news-body">
                    <div class="news-headline">${item.headline || ''}</div>
                    <div class="news-desc">${item.description || ''}</div>
                </div>
            </a>`;
        }
        container.innerHTML = html;
    } catch (e) {
        if (e.name === 'AbortError') return;
        container.innerHTML = '';
    }
}

function initNews() {
    fetchNews();
}

// ===== Landing page — live snapshot =====

async function fetchFeaturedMatch() {
    const container = document.getElementById('featured-match');
    if (!container) return;
    try {
        const signal = abortStale('featured-match');
        const today = dateParam(new Date());
        const data = await fetchWithDedup(`${API_BASE}/scoreboard?dates=${today}`, signal);
        const events = data.events || [];
        const live = events.find(ev => {
            const n = (ev.competitions?.[0]?.status?.type?.name || '').toLowerCase();
            return n.includes('in_progress') || n.includes('halftime') || n.includes('live') || n.includes('second_half') || n.includes('first_half') || (n.includes('status_') && !n.includes('scheduled') && !n.includes('full_time') && !n.includes('complete') && !n.includes('postponed'));
        });
        const upcoming = !live ? events.find(ev => {
            const n = (ev.competitions?.[0]?.status?.type?.name || '').toLowerCase();
            return n.includes('scheduled');
        }) : null;
        const match = live || upcoming;
        if (!match) {
            container.innerHTML = '<div class="featured-match-inner"><div class="no-data"><p>No upcoming matches</p></div></div>';
            return;
        }
        const comp = match.competitions?.[0];
        if (!comp) {
            container.innerHTML = '<div class="featured-match-inner"><div class="no-data"><p>Match data unavailable</p></div></div>';
            return;
        }
        const competitors = comp.competitors || [];
        const type = comp.status?.type?.name || '';
        const detail = comp.status?.type?.description || '';
        const tl = type.toLowerCase();
        const isLive = tl.includes('in_progress') || tl.includes('halftime') || tl.includes('live') || tl.includes('second_half') || tl.includes('first_half') || (tl.includes('status_') && !tl.includes('scheduled') && !tl.includes('full_time') && !tl.includes('complete') && !tl.includes('postponed'));
        const isFT = tl.includes('complete') || tl.includes('full_time');
        const clock = comp.status?.displayClock || '';
        const scores = competitors.map(c => parseInt(c.score));
        const winnerIdx = isFT && scores[0] !== scores[1] ? scores.indexOf(Math.max(...scores)) : -1;
        const round = comp.round?.displayName || '';
        const venue = comp.venue?.fullName || '';
        const city = comp.venue?.address?.city || '';
        const venueStr = [venue, city].filter(Boolean).join(', ');

        let badgeHtml;
        if (isLive) {
            badgeHtml = `<span class="fm-badge"><span class="dot"></span> LIVE${clock ? ' ' + clock : ''}</span>`;
        } else if (isFT) {
            badgeHtml = `<span class="fm-badge fm-badge--ft">Full Time</span>`;
        } else {
            const date = new Date(comp.date);
            const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
            badgeHtml = `<span class="fm-badge fm-badge--upcoming">${date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} @ ${timeStr}</span>`;
        }

        function flagUrl(team) {
            const abbr = team.abbreviation;
            if (abbr) return `https://a.espncdn.com/i/teamlogos/countries/500/${abbr.toLowerCase()}.png`;
            return '';
        }

        let html = '<div class="featured-match-inner"><div class="fm-match">';
        for (let i = 0; i < competitors.length; i++) {
            const c = competitors[i];
            const t = c.team;
            const url = flagUrl(t);
            html += `<div class="fm-team">
                <img class="fm-team-crest" src="${url}" alt="${t.displayName}" loading="lazy" onerror="this.style.display='none'">
                <div class="fm-team-name"><img class="fm-team-flag" src="${url}" alt="" loading="lazy" onerror="this.style.display='none'">${t.displayName}</div>
            </div>`;
            if (i === 0) {
                const sc0 = competitors[0].score ?? '–';
                const sc1 = competitors[1]?.score ?? '–';
                const sc0class = winnerIdx === 0 ? ' fm-score-live' : '';
                const sc1class = winnerIdx === 1 ? ' fm-score-live' : '';
                html += `<div class="fm-score"><span class="fm-score-num${sc0class}">${sc0}</span><span class="fm-score-sep">–</span><span class="fm-score-num${sc1class}">${sc1}</span></div>`;
            }
        }
        html += '</div>';
        html += `<div class="fm-info">${badgeHtml}`;
        if (round) html += `<span class="fm-stage">${round}</span>`;
        if (venueStr) html += `<span class="fm-venue">${venueStr}</span>`;
        html += '</div></div>';
        container.innerHTML = html;
    } catch (e) {
        if (e.name === 'AbortError') return;
        container.innerHTML = '<div class="featured-match-inner"><div class="error-box">Failed to load match data.</div></div>';
    }
}

async function fetchStandingsSnippet() {
    const container = document.getElementById('standings-snippet');
    if (!container) return;
    try {
        const signal = abortStale('standings-snippet');
        const data = await fetchWithDedup(`${API_V2}/standings`, signal);
        const groups = data.children || [];
        if (groups.length === 0) {
            container.innerHTML = '<div class="snapshot-card"><div class="snapshot-header"><span class="snapshot-title">Standings</span><a class="snapshot-link" href="standings.html">View all groups</a></div><div class="no-data"><p>Not yet available</p></div></div>';
            return;
        }
        // Find most competitive group (smallest average point spread)
        let bestGroup = groups[0];
        let bestSpread = Infinity;
        for (const g of groups) {
            const entries = g.standings?.entries || [];
            if (entries.length < 2) continue;
            const pts = entries.map(e => {
                const s = {};
                e.stats.forEach(st => { s[st.name] = parseInt(st.displayValue) || 0; });
                return s.points || 0;
            });
            const spread = Math.max(...pts) - Math.min(...pts);
            if (spread < bestSpread) {
                bestSpread = spread;
                bestGroup = g;
            }
        }
        const entries = bestGroup.standings?.entries || [];
        const top4 = entries.slice(0, 4);
        const header = `<div class="snapshot-header"><span class="snapshot-title">${bestGroup.name}</span><a class="snapshot-link" href="standings.html">View all groups</a></div>`;
        let table = `<table class="snapshot-standings"><tr><th>#</th><th style="text-align:left">Team</th><th>GD</th><th>Pts</th></tr>`;
        for (let i = 0; i < top4.length; i++) {
            const entry = top4[i];
            const team = entry.team;
            const s = {};
            entry.stats.forEach(st => { s[st.name] = st.displayValue; });
            const gd = s.pointDifferential || '0';
            const gdClass = parseInt(gd) > 0 ? 'ss-gd-pos' : parseInt(gd) < 0 ? 'ss-gd-neg' : 'ss-gd-zero';
            const flag = team.logos?.[0]?.href || '';
            table += `<tr><td>${i + 1}</td><td><div class="ss-team"><img class="ss-flag" src="${flag}" alt="" loading="lazy" onerror="this.style.display='none'">${team.displayName}</div></td><td class="${gdClass}">${gd}</td><td class="ss-pts">${s.points || '0'}</td></tr>`;
        }
        table += '</table>';
        table += '<div class="snapshot-legend">GD = Goal difference</div>';
        container.innerHTML = header + table;
    } catch (e) {
        if (e.name === 'AbortError') return;
        container.innerHTML = '<div class="snapshot-card"><div class="snapshot-header"><span class="snapshot-title">Standings</span><a class="snapshot-link" href="standings.html">View all groups</a></div><div class="error-box">Failed to load standings.</div></div>';
    }
}

async function fetchScorerSnippet() {
    const container = document.getElementById('scorer-snippet');
    if (!container) return;
    try {
        const signal = abortStale('scorer-snippet');
        const data = await fetchWithDedup(`${API_BASE}/statistics`, signal);
        const statGroup = (data.stats || []).find(s => s.name === 'goalsLeaders');
        const leaders = statGroup?.leaders || [];
        if (leaders.length === 0) {
            container.innerHTML = '<div class="snapshot-card"><div class="snapshot-header"><span class="snapshot-title">Top Scorers</span><a class="snapshot-link" href="scorers.html">View all</a></div><div class="no-data"><p>No goals data yet</p></div></div>';
            return;
        }
        const top5 = leaders.slice(0, 5);
        let html = '<div class="snapshot-header"><span class="snapshot-title">Top Scorers</span><a class="snapshot-link" href="scorers.html">View all</a></div>';
        html += '<div class="ss-scorers">';
        for (let rank = 0; rank < top5.length; rank++) {
            const leader = top5[rank];
            const athlete = leader.athlete || {};
            const team = athlete.team || {};
            const value = leader.value || 0;
            const flagUrl = team.logos?.[0]?.href || '';
            const rankClass = rank === 0 ? ' ss-scorer-rank--leader' : '';
            const goalClass = rank === 0 ? ' ss-scorer-goals--leader' : '';
            html += `<div class="ss-scorer-row">
                <div class="ss-scorer-rank${rankClass}">${rank + 1}</div>
                <img class="ss-scorer-flag" src="${flagUrl}" alt="" loading="lazy" onerror="this.style.display='none'">
                <div class="ss-scorer-name">${athlete.displayName || 'Unknown'}</div>
                <div class="ss-scorer-goals${goalClass}">${value}</div>
            </div>`;
        }
        html += '</div>';
        container.innerHTML = html;
    } catch (e) {
        if (e.name === 'AbortError') return;
        container.innerHTML = '<div class="snapshot-card"><div class="snapshot-header"><span class="snapshot-title">Top Scorers</span><a class="snapshot-link" href="scorers.html">View all</a></div><div class="error-box">Failed to load data.</div></div>';
    }
}

function initLanding() {
    fetchFeaturedMatch();
    fetchStandingsSnippet();
    fetchScorerSnippet();
    fetchNews();
    let timer = null;
    function refresh() { if (!document.hidden) { fetchFeaturedMatch(); fetchStandingsSnippet(); fetchScorerSnippet(); fetchNews(); } }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    timer = setInterval(refresh, 60000);
}

initTheme();
