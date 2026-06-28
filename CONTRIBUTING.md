# Contributing to WC 2026 Tracker

Thanks for your interest in contributing! This guide covers the basics for getting started.

## Project Overview

A static site tracking FIFA World Cup 2026 standings, scores, match schedules, and top scorers. Built with plain HTML, CSS, and vanilla JavaScript — no build step, no frameworks, no API keys required.

All data is fetched client-side from ESPN's public API endpoints.

## Quick Start

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/<your-username>/wc2026-tracker.git
   ```
3. Open `index.html` in a browser — that's it, no server needed

For local development with live reload, any static file server works:
```bash
# Python
python3 -m http.server 8000

# Node (if npx is available)
npx serve .
```

## How to Contribute

### Reporting Issues

- Check existing issues before opening a new one
- Include your browser, OS, and steps to reproduce
- Screenshots or console errors are always helpful

### Submitting Changes

1. Create a branch from `master`:
   ```bash
   git checkout -b my-fix-name
   ```
2. Make your change with clear, descriptive commits
3. Test your change by opening the relevant HTML page in a browser
4. Push to your fork and open a pull request against `master`

### Pull Request Guidelines

- **One improvement per PR** — keep it focused and easy to review
- **Describe the change** — link any relevant issues and explain the "why"
- **Test in browser** — since there's no automated test suite, manual verification is important
- **Keep it simple** — this project intentionally avoids build tools and frameworks; please respect that constraint

### Areas That Could Use Help

- Accessibility improvements (ARIA labels, keyboard navigation, screen reader support)
- Mobile responsiveness refinements
- Error handling and user-facing error messages
- Documentation and code comments
- Performance (caching, lazy loading, reducing API calls)

## Code Style

- **HTML**: Semantic elements, lowercase tags, 4-space indentation
- **CSS**: BEM-ish naming (`.component-element--modifier`), CSS custom properties for theming
- **JavaScript**: ES6+, 4-space indentation, no semicolons (matching existing code)

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings` | Group standings |
| `site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard` | Match scores and schedules |
| `sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/leaders` | Top scorers and assists |

All endpoints are public and require no authentication.

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0](LICENSE) license.
