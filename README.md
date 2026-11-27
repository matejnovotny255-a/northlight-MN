# Northlight Studio

A plain HTML website for Northlight Studio, a 25-person design studio.

There are no frameworks and no build step: the site is a single static file, `index.html`, with inline CSS.

## Preview locally

Open `index.html` in a browser, or serve the folder:

```sh
python -m http.server 8000
```

Then visit http://localhost:8000.

## Deployment

Every push to `main` triggers the GitHub Actions workflow in `.github/workflows/deploy.yml`, which publishes the repository contents to GitHub Pages.

One-time setup: in the repository on GitHub, go to **Settings > Pages** and set **Source** to **GitHub Actions**.

## Structure

- `index.html`: the site
- `.github/workflows/deploy.yml`: the GitHub Pages deployment workflow

## Help Desk

`helpdesk.html` (with `helpdesk.css` and `helpdesk.js`) is a small ticket tracker: priority P1 to P3, response targets, statuses and an Overdue label. Tickets are saved in the browser's localStorage and the demo data is fake.

## Diagnostic tools

Read-only Node.js scripts in `tools/` (Node 18.15 or newer, no dependencies). They only query the system and never change any setting.

```sh
node tools/health-report.js        # OS, free disk space, firewall status, pending updates (Windows)
node tools/network-doctor.js       # router, then 1.1.1.1, then a website name; names the first failing step
node tools/network-doctor.js github.com   # use a different website name
node --test tools                  # run the tests (they use fake command output)
```

Each check prints PASS or FAIL (or SKIP when it cannot be read). Many routers ignore ping, so the router check also tries a TCP connection and does not blame the router when the internet works through it.

`troubleshoot.html` is a click-through "no internet" decision tree.

## Staff access (learning model)

`staff.html` and `staff.js` model a small staff directory: six fake users in Design, Sales and IT, two-step sign-in, an IT-only admin section with Joiner and Leaver buttons, and a leaver who cannot sign in. Everything is fake and lives in the browser's localStorage, so it is a learning model and not real security.

- Step 1: password, hashed with PBKDF2 (SHA-256, per-user salt) using the Web Crypto API.
- Step 2: a 6-digit time-based one-time code (TOTP, RFC 6238). A code cannot be used twice.
- Five wrong attempts lock the account for 30 seconds.
- Web Crypto needs https or localhost, so open it through GitHub Pages or `python -m http.server`.

## Home page, SEO and the contact form

`index.html` is the Northlight Studio home page: header links to every page, three services, a four-question FAQ and a contact form. All content is fake demo data and the page loads no outside scripts (a Content-Security-Policy meta tag enforces this).

- **SEO and GEO basics:** a title under 60 characters, a description under 155, one H1, alt text on every image, canonical and Open Graph tags, `Organization` and `FAQPage` JSON-LD, `robots.txt` and `sitemap.xml`. The FAQ JSON-LD must stay word-for-word identical to the visible FAQ; if you edit one, edit the other.
- **Contact form:** each field shows a clear error message. A valid message creates a ticket in the Help Desk storage (`helpdesk.tickets.v2`, impact Low, urgency from the form, status New), so it appears on `helpdesk.html`. Website ticket numbers start at HD-1006, above the demo tickets.

## Design

All four pages share one look: `site.css` holds the colours, header, footer, buttons, forms, tables and cards, and `helpdesk.css` adds only the ticket-list styling. It uses system fonts (no outside resources), follows the visitor's light or dark setting, works at phone width and shows a visible focus ring for keyboard users. To restyle the whole site, change the colour variables at the top of `site.css`.
