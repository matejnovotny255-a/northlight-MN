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

Every push to `main` triggers the GitHub Actions workflow in `.github/workflows/deploy.yml`. A `check` job runs first (`node tools/check-cloud.js` and `node --test tools/test/*.test.js`); only if it passes does the `deploy` job stamp the real build date and commit into `health.json` and publish the repository contents to GitHub Pages. A bad cloud design file therefore blocks the release.

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
node --test tools/test/*.test.js                  # run the tests (they use fake command output)
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

## CRM

`crm.html` and `crm.js` are a small CRM in plain JavaScript and localStorage (key `crm.data.v1`): leads, accounts, contacts, opportunities with stages (Lead, Qualified, Quote, Won, Lost) and support cases. Everything is fake demo data in your browser.

- **Convert** turns a lead into an account, a contact and a Qualified opportunity in one step. A lead converts only once, and a lead from a company that already has an account is attached to that account instead of creating a duplicate.
- **Support cases** have a priority and a due time. The due time is suggested from the priority (Critical 4 h, High 8 h, Medium 24 h, Low 72 h) and must be in the future. An open case past its due time shows an Overdue label.
- **Opportunities by stage** is a bar chart drawn with plain SVG (no libraries) with counts and amounts, and a text description for screen readers.
- Seed data: three fake leads and one open case, created once. "Reset sample data" restores them.

## Automation

`rules.json` holds automation rules as plain data, and `automation.js` runs them. When the website contact form on `index.html` is sent, the rules run in order:

1. **R1** creates a lead in the CRM storage (`crm.data.v1`).
2. **R2** creates a ticket in the Help Desk storage (`helpdesk.tickets.v2`).
3. **R3** runs only if the message contains the word "urgent" (a whole word, any case, so "URGENT!" matches but "urgently" does not). It sets the ticket to P1 and adds an alert to the outbox.

`automation.html` shows the outbox, a log line for every rule that ran (ok, skipped with the reason, or error) and the rules as loaded from `rules.json`. **Nothing is really sent**: the outbox is simulated and all data is fake and stays in the browser.

To change behaviour, edit `rules.json`. Supported actions are `create_crm_lead`, `create_ticket`, `set_ticket_priority` and `add_outbox_alert`; conditions are `containsWord` and `equals`. If `rules.json` cannot be loaded (for example when a page is opened as a file instead of over http), the form falls back to creating the lead and ticket only, and logs a warning, so a message is never lost.

## Settings, health and data export

- `health.json` holds the site name, version, build date and commit. The deploy workflow stamps the real build date and commit when it publishes. Bump `version` by hand when you release.
- `config.js` holds the settings (`siteName`, `locale`, `currency`, `alertRecipient`, `healthUrl`, `exportFilePrefix`). The CRM uses `locale` and `currency`, and automation uses `alertRecipient` as the default alert address. It is public, so never put secrets in it.
- `settings.html` shows the site info, the settings and every record saved in the browser. **Export all data** downloads every localStorage record as one JSON file (`northlight-export-YYYY-MM-DD-HHMM.json`) with the site version and a note that it is demo data only. The file includes fake demo password hashes and secrets from the Staff page, so do not treat it as real data.

## Cloud design and checker

`northlight.cloud.json` describes a resource group, a web app and a storage account with names and tags (`owner`, `env`, `cost-center`). It is a design only: nothing is deployed from it.

```sh
node tools/check-cloud.js            # prints PASS or FAIL per resource, exits 1 on any failure
node tools/check-cloud.js other.json # check another file
node --test tools/test/*.test.js                    # includes tests with fake, deliberately broken designs
```

The checker is read-only and fails on a missing or empty tag, a bad tag value (`owner` must be an email, `env` one of dev, test, prod, `cost-center` like `CC-1234`), a bad name (`rg-<workload>-<env>-<region>`, `app-<workload>-<env>-<region>-<nnn>`, `st<workload><env><nnn>` with 3 to 24 lowercase letters and digits), an env in the name that differs from the env tag, a duplicate name or a missing resource group. The file may add required tags but can never remove the three built-in ones.
