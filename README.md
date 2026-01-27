<div align="center" style="margin-bottom: 30px;">
  <div style="display: flex; align-items: center; justify-content: center; gap: 20px;">
    <img src="static/logo_black.svg#gh-light-mode-only" alt="Wikisophy Logo" width="120" />
    <img src="static/logo_white.svg#gh-dark-mode-only" alt="Wikisophy Logo" width="120" />
    <h1 style="border-bottom: none; margin: 0;">Wikisophy</h1>
  </div>
</div>

**Philosophy, origin of everything.**

_An interactive demonstration of the Wikipedia "Getting to Philosophy" phenomenon._

## About

When you click the first link in the main text of almost any Wikipedia article and keep repeating the process, you usually end up at Philosophy.

Wikisophy is an interactive web app that automates this phenomenon by starting from any article and following each first link, showing how diverse topics converge on philosophy.

## Usage

1. Search for an article or let the app pick a random one.
2. The app will display the path taken to reach the "Philosophy" article, along with the number of steps.
3. Based on the your journey, you may reach Philosophy, enter a loop or hit a dead end.

## How It Works

The application follows these rules to find the "first link":

1. Only considers links in the main article text
2. Skips links inside parentheses
3. Skips italicized text
4. Ignores infoboxes, tables, hatnotes, and navigation elements
5. Excludes Wikipedia namespace links (File:, Help:, Category:, etc.)

## Getting Started for Development and Contribution

### Prerequisites

- [Bun](https://bun.sh) (recommended) or Node.js

### Installation

```bash
# Clone the repository
git clone https://github.com/mdonmez/wikisophy.git
cd wikisophy

# Install dependencies
bun install

# Start the development server
bun run dev

# Open http://localhost:5173 in your browser
```

### Build for Production

```bash
# Create an optimized production build
bun run build

# Preview the production build
bun run preview
```

### Contributing

You can contribute by [opening an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-an-issue) or [submitting a pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request).

## License

This project is licensed under the [MIT License](LICENSE).
