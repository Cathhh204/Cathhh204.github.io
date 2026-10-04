# Image Processing Playground

<!--
  TEMPLATE ONLY. The course requires this README to be written by me, in my
  own words. Every TODO below is a note about what to write, not finished
  text. Delete this comment and each TODO as the section gets written.
-->

- **Live app:** TODO: paste the Render URL
- **Demo video:** TODO: paste the link (check that it opens in an incognito window)
- **Course:** CMU 15-113: Effective Coding with AI, Project 2

## What the project does

TODO: 2-4 sentences. What can a visitor do on the page, and why did I want to
build this particular project?

## How to use it

TODO: Walk through it as a first-time visitor: upload an image, pick a mode,
move a slider, read the explanation. Mention the accepted file types and the
size limit. Say whether it works on a phone.

## Features I am proud of

TODO: Pick 2-3 specific things and say why each one matters. Choose the ones
I can explain in detail if asked.

## How to run locally

TODO: Write the steps in my own words. For reference, the commands are:

```bash
cd image-processing-playground
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
# then open http://127.0.0.1:5001
```

TODO: Explain why the port is 5001 instead of Flask's usual 5000.

## Technical architecture

TODO: Describe the two halves and how they talk to each other:

- what the browser sends to `POST /api/process` and what comes back
- what each file is responsible for (`app.py`, `templates/index.html`,
  `static/script.js`, `static/style.css`)
- one or two design decisions and the reason behind them (for example: why the
  result comes back as base64 inside JSON, why sliders are debounced, why Canny
  runs before the Hough transform)

## Deployment

TODO: Explain how the app is hosted and how a new version gets deployed. For
reference, the Render web service settings are:

| Setting | Value |
|---|---|
| Root Directory | `image-processing-playground` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn app:app` |

TODO: Mention anything a visitor should know, such as the free tier going to
sleep and the first request being slow.

## AI usage

TODO: Summarize honestly how I used AI on this project: which tools and
models, what they produced, and what I wrote or changed myself. Include
citations for any model or outside source that produced a substantial part of
the code. Point to `prompt_log.md` for the full record.

## Security / handling secrets

TODO: State whether this project has any API keys or secrets and how I know.
Describe what happens to an uploaded image (where it goes, whether it is
stored) and what the server checks before processing a file.
