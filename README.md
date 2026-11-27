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
