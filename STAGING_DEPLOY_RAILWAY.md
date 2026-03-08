# Railway Staging Deploy (Phone Testing)

## 1) Create Service
1. Go to Railway.
2. Create `New Project` -> `Deploy from GitHub repo`.
3. Select this repository.

Railway will use `railway.json` + `Dockerfile`.

## 2) Set Environment Variables
In Railway service settings, add these variables (same values as your local `.env`):

- `DATABASE_URL`
- `JWT_SECRET`
- `IW_EMAIL`
- `IW_PASSWORD`
- `IW_BASE_URL`
- `ODDS_API_KEY`
- `OAUTH_SERVER_URL`
- `OWNER_OPEN_ID`
- `BUILT_IN_FORGE_API_URL`
- `BUILT_IN_FORGE_API_KEY`
- `VITE_APP_ID`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Optional:
- `GOOGLE_REDIRECT_URI` (leave empty if you want dynamic host-based redirect)

## 3) Get Staging Domain
After deploy, copy the Railway generated URL:

- App URL example: `https://your-app.up.railway.app`

## 4) Google OAuth Callback
Add this in Google Cloud OAuth client -> Authorized redirect URIs:

- `https://your-app.up.railway.app/api/oauth/callback`

If OAuth consent is in testing mode, add your tester emails in:

- Google Cloud -> `Auth Platform` -> `Audience` -> `Test users`

## 5) Test on Phone
Open:

- `https://your-app.up.railway.app`

Tap `Join Now` and complete Google sign-in.
