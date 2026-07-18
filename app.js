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

// Knockouts
const KNOCKOUT_STAGES = [
    { seasontype: 2, name: 'Round of 32', short: 'R32' },
    { seasontype: 3, name: 'Round of 16', short: 'R16' },
    { seasontype: 4, name: 'Quarterfinals', short: 'QF' },
    { seasontype: 5, name: 'Semifinals', short: 'SF' },
    { seasontype: 6, name: '3rd Place Match', short: '3rd' },
    { seasontype: 7, name: 'Final', short: 'Final' },
];

async function fetchKnockouts() {
    const container = document.getElementById('knockouts-container');
    if (!container) return;
    try {
        const signal = abortStale('knockouts');
        // Fetch all knockout stage scoreboards in parallel
        const results = await Promise.all(
            KNOCKOUT_STAGES.map(async (stage) => {
                try {
                    const data = await fetchWithDedup(
                        `${API_BASE}/scoreboard?seasontype=${stage.seasontype}`,
                        signal
                    );
                    const events = data.events || [];
                    // Filter to only get events matching this stage type
                    const matches = events.map(ev => {
                        const comp = ev.competitions?.[0];
                        if (!comp) return null;
                        const competitors = comp.competitors || [];
                        return { comp, competitors, event: ev };
                    }).filter(Boolean);
                    return { stage, matches };
                } catch (e) {
                    return { stage, matches: [], error: true };
                }
            })
        );

        clearLoadingMessages('knockouts-container');
        let html = '<div class="knockouts-grid">';
        for (const { stage, matches } of results) {
            if (matches.length === 0) continue;
            html += `<div class="knockout-round">`;
            html += `<div class="knockout-round-header">${stage.name}</div>`;
            html += `<div class="knockout-round-matches">`;
            for (const { comp, competitors } of matches) {
                const statusType = comp.status?.type?.name || '';
                const statusDetail = comp.status?.type?.description || '';
                const tl = statusType.toLowerCase();
                const isLive = tl.includes('in_progress') || tl.includes('halftime') || tl.includes('live') || tl.includes('second_half') || tl.includes('first_half') || (tl.includes('status_') && !tl.includes('scheduled') && !tl.includes('full_time') && !tl.includes('complete') && !tl.includes('postponed'));
                const isFT = tl.includes('complete') || tl.includes('full_time');
                const isPen = tl.includes('pen');
                const isScheduled = tl.includes('scheduled');
                const clock = comp.status?.displayClock || '';
                const scores = competitors.map(c => parseInt(c.score));
                const hasScores = scores.some(s => !isNaN(s) && s > 0);
                const winnerIdx = isFT && scores[0] !== scores[1] ? scores.indexOf(Math.max(...scores)) : -1;
                const venue = comp.venue?.fullName || '';
                const city = comp.venue?.address?.city || '';
                const venueStr = [venue, city].filter(Boolean).join(', ');
                const broadcast = comp.broadcasts?.[0]?.names?.join(', ') || '';
                const date = new Date(comp.date);
                const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

                html += `<div class="ko-match">`;
                for (let i = 0; i < competitors.length; i++) {
                    const c = competitors[i];
                    const t = c.team;
                    const advance = c.advance;
                    const isWinner = advance === true;
                    const isLoser = advance === false;
                    const rowClass = isWinner ? ' ko-team--advance' : isLoser ? ' ko-team--eliminated' : '';
                    const scoreVal = hasScores ? (c.score || '–') : '–';

                    html += `<div class="ko-team${rowClass}">`;
                    html += `<div class="ko-team-info">`;
                    html += `<img class="team-flag" src="${t.logos?.[0]?.href || ''}" alt="${t.displayName}" loading="lazy" onerror="this.style.display='none'">`;
                    html += `<span class="ko-team-name">${t.displayName}</span>`;
                    if (isWinner) html += `<span class="ko-badge ko-badge--advance">&#10003;</span>`;
                    if (isLoser) html += `<span class="ko-badge ko-badge--out">&times;</span>`;
                    html += `</div>`;
                    if (isScheduled && !hasScores) {
                        html += `<span class="ko-time">${timeStr}</span>`;
                    } else {
                        html += `<span class="ko-score${i === winnerIdx ? ' ko-score--winner' : ''}">${scoreVal}</span>`;
                    }
                    html += `</div>`;
                }
                // Status line
                if (isLive) {
                    html += `<div class="ko-status"><span class="status-live">${statusDetail || 'LIVE'}${clock ? ' ' + clock : ''}</span></div>`;
                } else if (isFT) {
                    const extra = isPen ? ' (PEN)' : '';
                    html += `<div class="ko-status"><span class="status-ft">FT${extra}</span></div>`;
                } else if (isScheduled) {
                    html += `<div class="ko-status ko-status--scheduled">${dateStr}</div>`;
                }
                if (venueStr || broadcast) {
                    html += `<div class="ko-meta">${[venueStr, broadcast].filter(Boolean).join(' &middot; ')}</div>`;
                }
                html += `</div>`;
            }
            html += `</div></div>`;
        }
        html += '</div>';
        container.innerHTML = html;
    } catch (e) {
        if (e.name === 'AbortError') return;
        clearLoadingMessages('knockouts-container');
        container.innerHTML = '<div class="error-box">Failed to load knockout matches.</div>';
    }
}

function initKnockouts() {
    startLoadingMessages('knockouts-container', LOADING_MSGS.knockouts);
    fetchKnockouts().catch(() => {});
    function refresh() { if (!document.hidden) fetchKnockouts().catch(() => {}); }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    setInterval(refresh, 60000);
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
    knockouts: [
        'Loading knockout bracket…',
        'Fetching knockout results…',
        'Looking up Round of 32 onwards…',
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
    fetchFinalsWeekend();
    fetchFinalsBracket();
    fetchFinalsTeams();
    fetchFeaturedMatch();
    fetchStandingsSnippet();
    fetchScorerSnippet();
    fetchNews();
    let timer = null;
    function refresh() { if (!document.hidden) { fetchFinalsWeekend(); fetchFinalsBracket(); fetchFinalsTeams(); fetchFeaturedMatch(); fetchStandingsSnippet(); fetchScorerSnippet(); fetchNews(); } }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    timer = setInterval(refresh, 60000);
}

// ===== Finals Weekend — featured dual match =====

const FINALS_DATES = '20260718-20260719';

function flagUrlFromAbbr(abbr) {
    if (!abbr) return '';
    return `https://a.espncdn.com/i/teamlogos/countries/500/${abbr.toLowerCase()}.png`;
}

async function fetchFinalsWeekend() {
    const container = document.getElementById('finals-weekend');
    if (!container) return;
    try {
        const signal = abortStale('finals-weekend');
        const data = await fetchWithDedup(`${API_BASE}/scoreboard?dates=${FINALS_DATES}`, signal);
        const events = data.events || [];
        if (events.length === 0) {
            container.innerHTML = '<div class="finals-weekend-inner"><div class="no-data"><p>Finals match data unavailable</p></div></div>';
            return;
        }

        // Sort: 3rd place first, final second (or by date)
        events.sort((a, b) => new Date(a.date) - new Date(b.date));

        let html = '<div class="finals-weekend-inner">';

        for (const ev of events) {
            const comp = ev.competitions?.[0];
            if (!comp) continue;
            const competitors = comp.competitors || [];
            const seasonSlug = ev.season?.slug || '';
            const isFinal = seasonSlug === 'final' || seasonSlug.includes('final');
            const is3rd = seasonSlug.includes('3rd') || seasonSlug.includes('third');
            const label = isFinal ? 'THE FINAL' : is3rd ? 'THIRD PLACE PLAYOFF' : 'FINALS';

            const labelClass = isFinal ? 'fw-match-label--gold' : 'fw-match-label--bronze';
            const cardClass = isFinal ? 'fw-match-card--final' : '';
            const trophy = isFinal ? '\u{1F3C6}' : '\u{1F949}';

            const type = comp.status?.type?.name || '';
            const detail = comp.status?.type?.description || '';
            const tl = type.toLowerCase();
            const isLive = tl.includes('in_progress') || tl.includes('halftime') || tl.includes('live') || tl.includes('second_half') || tl.includes('first_half') || (tl.includes('status_') && !tl.includes('scheduled') && !tl.includes('full_time') && !tl.includes('complete') && !tl.includes('postponed'));
            const isFT = tl.includes('complete') || tl.includes('full_time');
            const clock = comp.status?.displayClock || '';
            const scores = competitors.map(c => parseInt(c.score));
            const winnerIdx = isFT && scores[0] !== scores[1] ? scores.indexOf(Math.max(...scores)) : -1;
            const venue = comp.venue?.fullName || '';
            const city = comp.venue?.address?.city || '';

            let badgeHtml;
            if (isLive) {
                badgeHtml = `<span class="fw-badge fw-badge--live"><span class="dot"></span> LIVE${clock ? ' ' + clock : ''}</span>`;
            } else if (isFT) {
                badgeHtml = `<span class="fw-badge fw-badge--ft">Full Time</span>`;
            } else {
                const date = new Date(comp.date);
                const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
                const dateStr = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
                badgeHtml = `<span class="fw-badge fw-badge--upcoming">${dateStr} ${timeStr}</span>`;
            }

            html += `<div class="fw-match-card ${cardClass}">`;
            html += `<div class="fw-match-label fw-match-label ${labelClass}"><span class="trophy">${trophy}</span> ${label}</div>`;
            html += `<div class="fw-match-body">`;

            for (let i = 0; i < competitors.length; i++) {
                const c = competitors[i];
                const t = c.team;
                const url = t.logos?.[0]?.href || flagUrlFromAbbr(t.abbreviation);
                const advance = c.advance;
                const isWinner = advance === true;
                html += `<div class="fw-team">`;
                html += `<img class="fw-team-logo" src="${url}" alt="${t.displayName}" loading="lazy" onerror="this.style.opacity='0.3'">`;
                html += `<div class="fw-team-name">${t.displayName || ''}</div>`;
                html += `</div>`;
                if (i === 0) {
                    const sc0 = isFT || (isLive && scores.some(s => !isNaN(s) && s > 0)) ? (competitors[0].score || '0') : '0';
                    const sc1 = isFT || (isLive && scores.some(s => !isNaN(s) && s > 0)) ? (competitors[1]?.score || '0') : '0';
                    const sc0class = (isLive || (winnerIdx === 0)) ? ' fw-score-num--live' : '';
                    const sc1class = (isLive || (winnerIdx === 1)) ? ' fw-score-num--live' : '';
                    const showScores = isFT || (isLive && scores.some(s => !isNaN(s) && s > 0));
                    if (showScores) {
                        html += `<div class="fw-center">
                            <div class="fw-score-row">
                                <span class="fw-score-num${sc0class}">${sc0}</span>
                                <span class="fw-score-sep">-</span>
                                <span class="fw-score-num${sc1class}">${sc1}</span>
                            </div>
                        </div>`;
                    } else {
                        html += `<div class="fw-center">
                            <div class="fw-vs">vs</div>
                            ${badgeHtml}
                        </div>`;
                    }
                }
            }

            html += `</div>`;
            if (isFT || isLive) {
                html += `<div class="fw-venue" style="text-align:center;">${badgeHtml}`;
            } else {
                html += `<div class="fw-venue" style="text-align:center;">`;
            }
            if (venue || city) {
                html += `<span class="venue-icon">\u{1F4CD}</span>${[venue, city].filter(Boolean).join(', ')}`;
            }
            html += `</div>`;
            html += `</div>`;
        }

        html += '</div>';
        container.innerHTML = html;
    } catch (e) {
        if (e.name === 'AbortError') return;
        container.innerHTML = '<div class="finals-weekend-inner"><div class="error-box">Failed to load finals data.</div></div>';
    }
}

// ===== Road to the Final bracket =====

const FINALS_BRACKET_STAGES = [
    { seasontype: 2, name: 'Round of 32', dates: '20260701-20260704' },
    { seasontype: 3, name: 'Round of 16', dates: '20260704-20260707' },
    { seasontype: 4, name: 'Quarterfinals', dates: '20260709-20260712' },
    { seasontype: 5, name: 'Semifinals', dates: '20260714-20260715' },
];

async function fetchFinalsBracket() {
    const container = document.getElementById('finals-bracket');
    if (!container) return;
    try {
        const signal = abortStale('finals-bracket');
        const results = await Promise.all(
            FINALS_BRACKET_STAGES.map(async (stage) => {
                try {
                    const data = await fetchWithDedup(
                        `${API_BASE}/scoreboard?dates=${stage.dates}`,
                        signal
                    );
                    const events = data.events || [];
                    const matches = events.filter(ev => {
                        const slug = ev.season?.slug || '';
                        const seasonType = slug.replace(/-/g, '');
                        const stageType = String(stage.seasontype);
                        // Match by season slug or date range
                        const matchMap = {
                            '2': ['round-of-32'],
                            '3': ['round-of-16'],
                            '4': ['quarterfinals'],
                            '5': ['semifinals'],
                        };
                        return matchMap[stageType]?.some(s => slug.includes(s)) || false;
                    }).map(ev => {
                        const comp = ev.competitions?.[0] || {};
                        return {
                            home: comp.competitors?.[0],
                            away: comp.competitors?.[1],
                            status: comp.status,
                            venue: comp.venue,
                            notes: comp.notes,
                        };
                    }).filter(m => m.home && m.away);
                    return { stage, matches };
                } catch (e) {
                    return { stage, matches: [] };
                }
            })
        );

        let html = '<div class="finals-bracket">';
        for (const { stage, matches } of results) {
            if (matches.length === 0) continue;
            html += `<div class="fb-round">`;
            html += `<div class="fb-round-header">${stage.name}</div>`;
            for (const m of matches) {
                const statusName = (m.status?.type?.name || '').toLowerCase();
                const isFT = statusName.includes('complete') || statusName.includes('full_time');
                const isPen = statusName.includes('pen');
                const homeScore = parseInt(m.home.score) || 0;
                const awayScore = parseInt(m.away.score) || 0;
                const homeWins = isFT && homeScore > awayScore;
                const awayWins = isFT && awayScore > homeScore;
                const notes = m.notes || [];
                const noteStr = notes.map(n => n.headline).find(h => h) || '';
                const homeAdv = m.home.advance;
                const awayAdv = m.away.advance;

                html += `<div class="fb-match">`;
                html += `<div class="fb-match-row">`;
                const homeUrl = m.home.team?.logos?.[0]?.href || flagUrlFromAbbr(m.home.team?.abbreviation);
                const homeClass = (homeAdv === true || homeWins) ? ' winner' : '';
                html += `<div class="fb-match-team${homeClass}"><img class="flag" src="${homeUrl}" alt="" loading="lazy" onerror="this.style.display='none'">${m.home.team?.displayName || '?'}</div>`;
                html += `<div class="fb-match-score${homeClass}">${m.home.score || '0'}</div>`;
                html += `</div>`;
                html += `<div class="fb-match-row">`;
                const awayUrl = m.away.team?.logos?.[0]?.href || flagUrlFromAbbr(m.away.team?.abbreviation);
                const awayClass = (awayAdv === true || awayWins) ? ' winner' : '';
                html += `<div class="fb-match-team${awayClass}"><img class="flag" src="${awayUrl}" alt="" loading="lazy" onerror="this.style.display='none'">${m.away.team?.displayName || '?'}</div>`;
                html += `<div class="fb-match-score${awayClass}">${m.away.score || '0'}</div>`;
                html += `</div>`;
                if (noteStr) {
                    html += `<div class="fb-match-pen">${noteStr}</div>`;
                }
                const venue = m.venue?.fullName || '';
                if (venue) {
                    html += `<div class="fb-match-venue">${venue}</div>`;
                }
                html += `</div>`;
            }
            html += `</div>`;
        }
        html += '</div>';
        container.innerHTML = html;
    } catch (e) {
        if (e.name === 'AbortError') return;
        container.innerHTML = '<div class="error-box">Failed to load bracket data.</div>';
    }
}

// ===== Finals team preview =====

async function fetchFinalsTeams() {
    const container = document.getElementById('finals-teams');
    if (!container) return;
    try {
        const signal = abortStale('finals-teams');
        // Get standings to get all team stats
        const standingsData = await fetchWithDedup(`${API_V2}/standings`, signal);

        // Find the 4 semifinalist teams: Spain, Argentina, England, France
        const targetTeams = new Map();
        const semisData = await fetchWithDedup(`${API_BASE}/scoreboard?dates=20260714-20260719`, signal);
        for (const ev of semisData.events || []) {
            const comp = ev.competitions?.[0];
            if (!comp) continue;
            for (const c of comp.competitors || []) {
                const t = c.team;
                if (t && t.abbreviation) {
                    targetTeams.set(t.abbreviation.toLowerCase(), {
                        name: t.displayName,
                        abbr: t.abbreviation,
                        logo: t.logos?.[0]?.href || flagUrlFromAbbr(t.abbreviation),
                    });
                }
            }
        }

        // Get their group stage stats from standings
        const teamStats = {};
        for (const group of standingsData.children || []) {
            for (const entry of group.standings?.entries || []) {
                const team = entry.team;
                const abbr = team.abbreviation?.toLowerCase();
                if (!abbr || !targetTeams.has(abbr)) continue;
                const s = {};
                entry.stats.forEach(st => { s[st.name] = st.displayValue; });
                teamStats[abbr] = {
                    ...targetTeams.get(abbr),
                    played: s.gamesPlayed || '0',
                    wins: s.wins || '0',
                    draws: s.ties || '0',
                    losses: s.losses || '0',
                    gf: s.pointsFor || '0',
                    ga: s.pointsAgainst || '0',
                    gd: s.pointDifferential || '0',
                    pts: s.points || '0',
                };
            }
        }

        // Also get their knockout results from the bracket data
        const koData = await fetchWithDedup(`${API_BASE}/scoreboard?dates=20260701-20260719`, signal);
        const teamPaths = {};
        const stageNames = {
            'round-of-32': 'R32',
            'round-of-16': 'R16',
            'quarterfinals': 'QF',
            'semifinals': 'SF',
            '3rd-place-match': '3rd',
            'final': 'Final',
        };
        for (const ev of koData.events || []) {
            const comp = ev.competitions?.[0];
            if (!comp) continue;
            const slug = ev.season?.slug || '';
            const stageLabel = stageNames[slug] || slug;
            for (const c of comp.competitors || []) {
                const abbr = c.team?.abbreviation?.toLowerCase();
                if (!abbr) continue;
                if (!teamPaths[abbr]) teamPaths[abbr] = [];
                const opp = comp.competitors?.find(x => x !== c)?.team?.abbreviation || '?';
                const myScore = c.score || '0';
                const oppScore = comp.competitors?.find(x => x !== c)?.score || '0';
                const advanced = c.advance === true;
                teamPaths[abbr].push({
                    stage: stageLabel,
                    result: `${myScore}-${oppScore} vs ${opp.toUpperCase()}`,
                    advanced: advanced,
                });
            }
        }

        // Determine roles
        const finalTeams = [];
        for (const [abbr, data] of Object.entries(teamStats)) {
            const path = teamPaths[abbr] || [];
            const role = abbr === 'esp' || abbr === 'arg' ? 'FINAL' : abbr === 'eng' || abbr === 'fra' ? '3rd Place' : '';
            finalTeams.push({ ...data, path, role });
        }

        // Sort: Final teams first, then 3rd place
        finalTeams.sort((a, b) => {
            if (a.role === 'FINAL' && b.role !== 'FINAL') return -1;
            if (a.role !== 'FINAL' && b.role === 'FINAL') return 1;
            return 0;
        });

        if (finalTeams.length === 0) {
            container.innerHTML = '<div class="no-data"><p>Team data unavailable</p></div>';
            return;
        }

        let html = '<div class="finals-teams-grid">';
        for (const team of finalTeams) {
            const roleColor = team.role === 'FINAL' ? 'var(--green)' : 'var(--yellow)';
            html += `<div class="ft-card">`;
            html += `<div class="ft-card-header">`;
            html += `<img class="ft-card-logo" src="${team.logo}" alt="${team.name}" loading="lazy" onerror="this.style.opacity='0.3'">`;
            html += `<div>`;
            html += `<div class="ft-card-name">${team.name}</div>`;
            if (team.role) {
                html += `<div class="ft-card-role" style="color:${roleColor}">${team.role}</div>`;
            }
            html += `</div></div>`;

            if (team.played) {
                html += `<div class="ft-card-stats">`;
                html += `<div class="ft-stat"><div class="ft-stat-value">${team.wins}-${team.draws}-${team.losses}</div><div class="ft-stat-label">W-D-L</div></div>`;
                html += `<div class="ft-stat"><div class="ft-stat-value">${team.gf}:${team.ga}</div><div class="ft-stat-label">Goals</div></div>`;
                html += `<div class="ft-stat"><div class="ft-stat-value">${team.gd}</div><div class="ft-stat-label">GD</div></div>`;
                html += `</div>`;
            }

            if (team.path.length > 0) {
                html += `<div class="ft-card-path">`;
                html += `<span class="path-label">Road to Finals</span>`;
                const validPath = team.path.filter(p => p.stage && p.result);
                for (const p of validPath.slice(-5)) {
                    const status = p.advanced === true ? '<span style="color:var(--green)">&#10003;</span>' : p.advanced === false ? '<span style="color:var(--red)">&#10007;</span>' : '';
                    html += `<div>${p.stage}: ${p.result} ${status}</div>`;
                }
                html += `</div>`;
            }

            html += `</div>`;
        }
        html += '</div>';
        container.innerHTML = html;
    } catch (e) {
        if (e.name === 'AbortError') return;
        container.innerHTML = '<div class="error-box">Failed to load team preview.</div>';
    }
}

initTheme();
