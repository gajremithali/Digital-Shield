# YouTube OAuth setup

This version includes a real server-side YouTube OAuth scaffold. It does not contain Google credentials.

## 1. Create Google OAuth credentials
Create a Google Cloud project, enable the YouTube Data API, and create an OAuth 2.0 Web application client.

Set the authorized redirect URI to:
`https://zmfbphdkrxovpckgwpgh.supabase.co/functions/v1/youtube-callback`

## 2. Set Supabase Edge Function secrets
Set these secrets in Supabase Edge Functions:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- OAUTH_STATE_SECRET (a long random secret)
- YOUTUBE_REDIRECT_URI = https://zmfbphdkrxovpckgwpgh.supabase.co/functions/v1/youtube-callback
- SITE_URL = your deployed Digital Shield website URL

Never put GOOGLE_CLIENT_SECRET in index.html.

## 3. Deploy
Deploy `youtube-start` and `youtube-callback` with the Supabase CLI or Dashboard.

## 4. User flow
The website calls `youtube-start` while the user is signed in. The function returns Google's OAuth URL. The browser goes to Google, the user grants the requested YouTube read-only scope, and the callback exchanges the authorization code server-side. Only derived profile signals are stored in `social_signals`; OAuth tokens are not stored by this scaffold.
