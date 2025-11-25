# Copilot Instructions for MB_REPORT Codebase

## Overview
This project is split into two main components:
- **Backend/**: Node.js server (see `Backend/server.js`) serving as the API and static file host.
- **Frontend/**: Static HTML/CSS/JS files for user interface (see `Frontend/`).

## Architecture & Data Flow
- The backend (`server.js`) uses Express to serve static files and handle API requests.
- Font assets and images are stored in `Backend/` and `Frontend/` as needed for rendering and branding.
- The frontend communicates with the backend via HTTP requests (AJAX/fetch).

## Developer Workflows
- **Start Backend**: Run `node Backend/server.js` from the project root or `Backend/`.
- **Frontend Development**: Open HTML files in `Frontend/` directly in a browser. No build step required.
- **Static Assets**: Fonts and images are referenced directly by path; ensure correct relative paths in HTML/CSS/JS.

## Project-Specific Conventions
- Font files (Sarabun family) are stored in `Backend/` for backend-side static serving.
- No build tools or bundlers are used; all JS/CSS is loaded as-is.
- API endpoints and static file serving are handled in a single Express server (`server.js`).
- Images used in both backend and frontend are duplicated for simplicity.

## Integration Points
- No database integration detected; all data is handled in-memory or via static files.
- No authentication or session management present by default.
- External dependencies are managed via `Backend/package.json` (Express, etc.).

## Patterns & Examples
- To add a new API route, edit `Backend/server.js` and follow the existing Express route pattern.
- To add new static assets, place them in the appropriate directory and reference them by relative path.
- For frontend changes, edit files in `Frontend/` and reload in the browser.

## Key Files
- `Backend/server.js`: Main backend logic and entry point.
- `Backend/package.json`: Backend dependencies.
- `Frontend/main.html`, `Frontend/script.js`, `Frontend/style.css`: Main frontend files.

---

**If you are unsure about a workflow or convention, ask the user for clarification.**
