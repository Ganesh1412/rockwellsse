# Rockwell Site Surveys Engineering Support Chat

A polished customer-support chatbot for Rockwell Site Surveys Engineering, styled as a Claude-inspired assistant and deployed as a static site on GitHub Pages.

## What’s included
- A polished landing page and chat experience
- Quick-action prompts for common support questions
- A lightweight rule-based “brain” for service, pricing, contact, and timeline help
- A second live tool using the USGS Earthquake Hazards Program feed for recent seismic activity by area
- A GitHub Actions workflow for automatic deployment to GitHub Pages

## Local preview
Open index.html in a browser, or run:

```bash
python3 -m http.server 8000
```

Then visit http://127.0.0.1:8000/

## Deployment
The site is published from the main branch through the GitHub Pages workflow in .github/workflows/deploy.yml.

## Backend integration
To use a remote backend with the GitHub Pages frontend:

- Deploy your backend API separately and expose a POST endpoint that accepts `{ message }` and returns `{ reply }`.
- Set `window.ROCKWELL_BACKEND_URL` in `config.js` to the backend URL.
- Set `window.ROCKWELL_SHEET_URL` to the Google Sheet URL you want the chatbot to query live for each question.

Example `config.js` for production:

```js
window.ROCKWELL_BACKEND_URL = 'https://your-backend.example.com/api/chat';
window.ROCKWELL_SHEET_URL = 'https://docs.google.com/spreadsheets/d/<sheet-id>/edit';
```

If the backend is unavailable, the UI will fall back to the local rule-based response logic.

## LLM validation (pass/fail)

Use this section to verify that the deployed backend behaves like a genuine language model workflow and not a fixed script.

### Run the probe

```bash
npm run validate:llm
```

Optional environment overrides:

```bash
CHAT_ENDPOINT="https://rockwellsse.fly.dev/api/chat" CHAT_TIMEOUT_MS=15000 npm run validate:llm
```

### What the probe checks

- Off-topic robustness (3 tests):
	- `can I order food?`
	- `write a haiku about concrete foundations`
	- `what is the capital of Mars?`
- In-domain behavior (3 tests):
	- Survey + earthquakes combined prompt
	- Survey pricing prompt
	- Earthquake-only prompt

### Pass/fail gates

- `offTopicGate`: All off-topic tests must pass.
	- Fail if a reply looks like a raw sheet row dump (for example repeated fields such as `service_name`, `fee_eur`, `slots_this_week`).
	- Pass if the reply is contextual to the off-topic question or politely redirects to support scope.
- `inDomainGate`: At least 67% of in-domain tests must pass.
	- Pass requires a meaningful keyword hit ratio for expected domain entities (service, region, earthquake/USGS context).
- `latencyGate`: Average response latency must be less than or equal to 8000 ms.

Overall status is `PASS` only when all three gates pass. The command exits with code `0` on pass and `1` on fail for CI/CD use.

### Output artifact

The probe prints per-test evidence (`PASS` or `FAIL`, reasons, latency, and raw reply) and a final JSON summary that can be archived in build logs.
