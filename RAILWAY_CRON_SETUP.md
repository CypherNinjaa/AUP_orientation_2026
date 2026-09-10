# Railway Cron Job Setup & Architecture Guide

> [!CAUTION]
> **CRITICAL ARCHITECTURAL RULE IN RAILWAY:**  
> **Never enable "Cron Schedule" directly on the `@orientation/web` service.**  
> In Railway, setting a Cron Schedule on a service converts that entire service into a batch job: Railway scales its replicas to **0** and shuts down the web server between runs. This takes the entire public orientation portal offline!  
>  
> Instead, the web server (`@orientation/web`) must run **24/7**, and the Cron Job must be a **separate worker service** in the same Railway project that triggers the broadcast and exits.

---

## 1. Why Railway Requires a Dedicated Cron Service

According to official [Railway Cron Documentation](https://docs.railway.com/deploy/cron-jobs):

| Service Type | Lifecycle | Expected Process Behavior | Example in this Project |
|---|---|---|---|
| **Web Service** | Runs **24/7** continuously | Listens on port `8080` indefinitely; handles HTTP requests from students & admins. | `@orientation/web` |
| **Cron Job Service** | Boots on schedule, **exits upon completion** | Runs a task (e.g. `curl` or script), exits with code `0`, and shuts down until next run. | `cron-whatsapp` |

When a Cron Schedule is placed on `@orientation/web`:
1. Railway shuts down the web app (`0/6 replicas running`).
2. Students and gate volunteers cannot access `orientation.amitypatnaevents.in`.
3. When the cron schedule fires, Railway runs `npm run start`, which is a persistent server that never exits, causing Railway to flag the cron execution as stuck.

---

## 2. Proper Railway Setup: Two-Service Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Railway Project: sublime-manifestation               │
│                                                                        │
│  ┌─────────────────────────────────┐   HTTP POST /api/cron/...         │
│  │   cron-whatsapp (Cron Job)      │ ──────────────────────────────┐   │
│  │   • Image: curlimages/curl      │                               │   │
│  │   • Cron Schedule: 0 * * * *    │                               │   │
│  │   • Boots, triggers, & EXITS    │                               ▼   │
│  └─────────────────────────────────┘                    ┌─────────────────────────┐
│                                                         │   @orientation/web      │
│                                                         │   • 24/7 Web App Server │
│                                                         │   • 6/6 Replicas Online │
│                                                         │   • Receptive to hits   │
│                                                         └───────────┬─────────────┘
│                                                                     │
└─────────────────────────────────────────────────────────────────────┼───┘
                                                                      │ WhatsApp
                                                                      ▼
                                                             ┌─────────────────┐
                                                             │ WhatsApp Admins │
                                                             │ (+91 9199697225)│
                                                             └─────────────────┘
```

---

## 3. Active Railway Setup: Live Service Status

The dedicated **`cron-whatsapp`** service is **already created and active** in your project canvas:

| Setting | Live Configuration |
|---|---|
| **Service Name** | `cron-whatsapp` (ID: `a4465f0f-0d5a-4458-9343-f1db3fc6e9f3`) |
| **Docker Image** | `curlimages/curl:latest` |
| **Cron Schedule** | `0 * * * *` *(Hourly)* |
| **Start Command** | `curl -f -s -S -X POST -H "Authorization: Bearer $CRON_SECRET" https://orientation.amitypatnaevents.in/api/cron/whatsapp-summary` |
| **Environment Variable** | `CRON_SECRET` = `cron_sec_89d3a7e5b2c1f0e49a8b7c6d5e4f3a2b` |
| **Restart Policy** | `ON_FAILURE` (Max 3 retries) |

---

## 4. How to Adjust the Cron Schedule in Railway

If you want to change how frequently the bot sends summaries (e.g. from Hourly to 2 or 3 times a day):

1. Open your project in [Railway Dashboard](https://railway.com/project/2c377e01-ac10-4e9a-ae02-4756297c044c).
2. Click the **`cron-whatsapp`** service card on your canvas.
3. Go to the **Settings** tab.
4. Scroll down to **Deploy** > **Cron Schedule**:
   - Change the cron expression:
     - **Hourly**: `0 * * * *`
     - **Every 2 Hours (8 AM – 8 PM IST)**: `30 2-14/2 * * *`
     - **3 Times Daily (8:00 AM, 2:00 PM, 8:00 PM IST)**: `30 2,8,14 * * *`
5. Railway will automatically save and schedule the next run.

---

## 4. IST vs. UTC Schedule Reference Table

Railway evaluates all cron schedules in **UTC** (IST = UTC + 5:30).

| IST Time Description | UTC Expression | Railway Cron Expression |
|---|---|---|
| **Every 1 Hour** | Every hour on the hour | `0 * * * *` |
| **Every 30 Minutes** | Every 30 minutes | `*/30 * * * *` |
| **8:00 AM IST daily** | 02:30 UTC | `30 2 * * *` |
| **1:00 PM IST daily** | 07:30 UTC | `30 7 * * *` |
| **8:00 PM IST daily** | 14:30 UTC | `30 14 * * *` |
| **8 AM, 2 PM, 8 PM IST** | 02:30, 08:30, 14:30 UTC | `30 2,8,14 * * *` |
## 5. Minute-by-Minute & Event Scenario Cheatsheet

Copy and paste any of the expressions below into the **Cron Schedule** box in Railway:

### Quick Interval Testing & High-Frequency Modes

| Scenario | Description | Railway Cron Expression |
|---|---|---|
| **Every 5 Minutes** | Fastest allowed frequency on Railway; ideal for testing or live peak rush at the gate. | `*/5 * * * *` |
| **Every 10 Minutes** | High-velocity check-in monitoring. | `*/10 * * * *` |
| **Every 15 Minutes** | Standard rush-hour updates. | `*/15 * * * *` |
| **Every 20 Minutes** | Balanced active monitoring. | `*/20 * * * *` |
| **Every 30 Minutes** | Twice per hour updates. | `*/30 * * * *` |
| **Every 1 Hour** | Hourly pulse (default). | `0 * * * *` |
| **Every 2 Hours** | Bi-hourly orientation overview. | `0 */2 * * *` |

---

### Event Day Time-of-Day Scenarios (Converted to IST)

*Railway cron operates in UTC (UTC = IST - 5 hours 30 mins).*

| Scenario | IST Clock Time | Railway Cron Expression |
|---|---|---|
| **Morning Briefing** | 8:00 AM IST | `30 2 * * *` |
| **Pre-Gate Opening** | 12:00 PM IST (Noon) | `30 6 * * *` |
| **Gate Rush Window** | Every 10 mins between 12:30 PM – 3:30 PM IST | `*/10 7-10 * * *` |
| **Post-Event Wrap-up** | 6:30 PM IST | `0 13 * * *` |
| **Nightly Summary** | 9:00 PM IST | `30 15 * * *` |
| **3 Key Checkpoints** | 8:00 AM, 1:30 PM, and 7:00 PM IST | `30 2,8,13 * * *` |
| **Daytime Hourly** | Every hour between 8:30 AM and 8:30 PM IST | `30 3-15 * * *` |

Once configured:
- In the Railway dashboard under `cron-whatsapp`, the card will display `Next run in X minutes`.
- When the cron fires, you will see a green run in **Deploy Logs**.
- The bot will broadcast the Orientation summary to all numbers in `WHATSAPP_ADMIN_NUMBERS`.
- The main web app `@orientation/web` will stay **Online 24/7** without interruption.
