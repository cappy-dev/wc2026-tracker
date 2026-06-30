# Contributing to WC 2026 Tracker

Thanks for your interest in contributing! This is a small project, so we keep things simple.

## How to Contribute

1. **Fork** the repository
2. Create a **branch** for your change (`git checkout -b my-feature`)
3. Make your changes and **commit** with a clear message
4. Open a **Pull Request** against the `master` branch

## Development Setup

No build tools required — just open `index.html` in a browser.

For a local server (recommended to avoid CORS issues):

```bash
# Python
python3 -m http.server 8000

# Node.js (if npx available)
npx serve .
```

Then visit `http://localhost:8000`.

## What to Contribute

- **Bug fixes** — broken standings, missing team data, display issues
- **Feature additions** — new pages or sections (e.g., bracket view, player stats)
- **UI/UX improvements** — accessibility, responsiveness, dark/light mode refinements
- **Documentation** — README corrections, code comments, this file

## Code Style

- Vanilla HTML/CSS/JavaScript — no frameworks
- 4-space indentation
- Keep API calls pointed at ESPN public endpoints only
- All data is fetched client-side; no server component

## Reporting Issues

Open a GitHub Issue with:
- What you expected to see
- What you actually saw
- Browser and device info (if relevant)

## License

By contributing, you agree that your changes will be licensed under AGPL-3.0, the same as the rest of this project.
