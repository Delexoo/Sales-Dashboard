# Lead Alert Bot

Get a **Telegram DM the moment a sales rep submits a lead**.

```
Rep submits lead (Lead Builder)
   -> Supabase  new_clients  (INSERT)
   -> Database Webhook (POST, with secret header)
   -> Render web service  (holds your Telegram secrets)
   -> Telegram DM to you
```

Supabase does the **detecting**. Render stores the **secrets** and **sends** the
message. Supabase pushes to Render, so even on Render's free plan the incoming
request wakes the service — no uptime pinger or paid plan needed.

---

## What's here

| File | Purpose |
|------|---------|
| `server.js` | Express service: `POST /webhook/new-lead`, plus `/healthz` and `/get-chat-id` |
| `package.json` | Start script + Express dependency |
| `.env.example` | The env vars to set (in Render, not in code) |
| `supabase-new-lead-webhook.sql` | Optional SQL to create the webhook by hand |

---

## Setup (about 10 minutes)

### Step 1 — Pick a webhook secret

Generate a long random string (any password generator). You'll paste the same
value into Render (`WEBHOOK_SECRET`) and the Supabase webhook header. This stops
strangers from POSTing fake leads to your bot.

### Step 2 — Deploy to Render

1. Push this repo to GitHub (or connect the existing one).
2. [render.com](https://render.com) → **New** → **Web Service**.
3. **Root Directory:** `LeadAlertBot`
4. **Build command:** `npm install`
5. **Start command:** `npm start`
6. **Environment** → add these variables:

   | Key | Value |
   |-----|-------|
   | `TELEGRAM_BOT_TOKEN` | From `WebsiteSellingBot/.env` |
   | `WEBHOOK_SECRET` | The string from Step 1 |
   | `TELEGRAM_CHAT_ID` | Leave blank for now — you'll fill it in Step 3 |

7. Deploy. Note your URL, e.g. `https://lead-alert-bot.onrender.com`.

### Step 3 — Get your Telegram chat id (for the DM)

A bot can only DM you **after you message it first**.

1. In Telegram, open your bot (the WebsiteSellingBot) and send it any message, e.g. `hi`.
2. In a browser open:
   `https://<your-app>.onrender.com/get-chat-id?secret=YOUR_WEBHOOK_SECRET`
3. Copy the `id` for your chat (a number like `123456789`).
4. In Render → Environment, set `TELEGRAM_CHAT_ID` to that number and save
   (the service redeploys automatically).

### Step 4 — Create the Supabase webhook

**Dashboard (easiest):**

1. Supabase → your project (`qxtvrlskuntfcsgqdekh`) → **Database** → **Webhooks** → **Create a new hook**.
2. **Name:** `new_lead_telegram_alert`
3. **Table:** `new_clients` · **Events:** `Insert`
4. **Type:** `HTTP Request` · **Method:** `POST`
5. **URL:** `https://<your-app>.onrender.com/webhook/new-lead`
6. **HTTP Headers** — add one:
   `x-webhook-secret` = your `WEBHOOK_SECRET`
7. Save.

**Or by SQL:** edit the two placeholders in `supabase-new-lead-webhook.sql`
and run it in the SQL Editor.

### Step 5 — Test

Submit a test lead from the Lead Builder (or insert a row into `new_clients`).
You should get a DM within a few seconds. (First alert after the service has
been idle may take ~30–60s while Render wakes up.)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| No DM at all | Confirm you DM'd the bot first (Step 3) and `TELEGRAM_CHAT_ID` is set |
| `/get-chat-id` returns empty `chats` | DM the bot, then refresh the page |
| `401 Unauthorized` in Supabase webhook logs | The `x-webhook-secret` header must exactly match Render's `WEBHOOK_SECRET` |
| `chat not found` | `TELEGRAM_CHAT_ID` is wrong, or you haven't DM'd the bot |
| Want alerts in a group topic instead of a DM | Set `TELEGRAM_CHAT_ID` to the group id and `TELEGRAM_TOPIC_ID` to the thread |

## Local testing (optional)

```bash
cd LeadAlertBot
npm install
copy .env.example .env   # then fill in real values
npm start                # http://localhost:3000/healthz
```
