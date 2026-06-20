# ⚽ FIFA World Cup 2026 Tracker

Live standings, scores, and match results for the 2026 FIFA World Cup — powered by the [ESPN public API](https://github.com/pseudo-r/Public-ESPN-API).

**Live at:** [cappy-dev.github.io/wc2026-tracker](https://cappy-dev.github.io/wc2026-tracker/)

## Features

- **Group Standings** — All 12 groups with points, wins, draws, losses, goals for/against, and goal difference
- **Match Results** — Live scores and final results with status indicators
- **Top Scorers** — Golden Boot race leaderboard
- **Auto-refresh** — Standings and matches update every 60 seconds
- **Dark mode** — Built for night owls

## Tech

Static HTML + CSS + vanilla JavaScript. No build step, no framework, no API key needed. All data fetched client-side from ESPN's public endpoints.

## Endpoints Used

- `site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings`
- `site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard`
- `sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/leaders`

## Local Development

Just open `index.html` in a browser. That's it. No server required.

## License

MIT
