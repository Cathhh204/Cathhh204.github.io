# Qi Chen — Personal Portfolio

Live site: https://cathhh204.github.io/ (enable GitHub Pages in **Settings → Pages** if it isn't live yet — see below)

A personal portfolio built with plain HTML, CSS, and JavaScript (no frameworks) as a hands-on way to
learn front-end web development.

## Sections

- **About** — bio, photo, interests, and skills
- **Projects** — showcases of work and research, pulled from real coursework/internship experience
- **Interests** — life outside the classroom, with a clickable photo carousel
- **Contact** — email, phone, and GitHub

## Features

- Fully responsive layout (desktop / tablet / mobile)
- Dark mode toggle with saved preference (`localStorage`)
- Mobile hamburger navigation
- Scroll-reveal animations via `IntersectionObserver`
- Click-to-advance photo carousel in the Interests section

## Project structure

```
index.html
css/style.css
js/script.js
assets/images/   # add profile.jpg here for the About photo
```

## Running locally

Just open `index.html` in a browser, or serve it locally:

```bash
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## Deploying (GitHub Pages)

This repo is named `<username>.github.io`, so GitHub Pages serves it automatically from the `main`
branch root once Pages is enabled:

1. Push this repo to GitHub (`git push origin main`).
2. Go to **Settings → Pages** on the repo.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. Save — the site will be live at `https://<username>.github.io/` within a minute or two.

## To personalize

- Add a real photo at `assets/images/profile.jpg` (falls back to an initials avatar until then).
- Add `assets/images/badminton1.jpeg`, `badminton2.jpeg`, and `badminton3.jpeg` for the Interests
  carousel (falls back to a placeholder until then).
- Add your LinkedIn (or other links) in the Contact section of `index.html`.
- Swap in new project cards in `index.html` as you build things this semester.
