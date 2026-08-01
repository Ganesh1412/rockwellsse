# Rockwell Site Surveys Engineering Support Chat

A polished customer-support chatbot for Rockwell Site Surveys Engineering, styled as a Claude-inspired assistant and deployed as a static site on GitHub Pages.

## What’s included
- A polished landing page and chat experience
- Quick-action prompts for common support questions
- A lightweight rule-based “brain” for service, pricing, contact, and timeline help
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
