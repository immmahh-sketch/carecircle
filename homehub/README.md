# HomeHub

A self-hosted smart home hub: one app for **SmartLife/Tuya**, **Meross** and **Wiser** devices, with **Flic button** setup,
**geofencing**, timers, schedules, scenes, colour lighting, and automations that react to **device power draw** and **devices dropping offline**.

Zero dependencies — Node 20+ only. Runs on a Raspberry Pi, NAS or always-on PC.

```bash
cd homehub
npm run demo     # simulated devices: try everything with no hardware
npm start        # real devices (configure under More → Connections)
npm test
```
On start it prints an **admin key** (the web app asks for it once) and a **hook key** (goes in Flic/phone URLs; it can't edit your config).
Open the app on your phone and "Add to Home Screen".

## What you can do

| Need | How |
|---|---|
| Controls, colour, brightness, warm↔cool | Home tab: tap a device. Preset colour chips + free colour wheel |
| Timers | Tap device → "Turn off in 5m…2h". Persisted, survive restarts |
| Schedules | Automate → "Schedule" recipe: clock time, `sunrise`/`sunset` ± offset, days of week |
| Scenes | Scenes → set lights how you like, tick devices, save |
| Flic buttons | Buttons tab: paste the URL into Flic's *Internet Request* action, press the button, it appears; pick an action for click / double / hold |
| One device controls another | Recipes "Device loses power → react" / "comes back online" (offline for N seconds, so blips are ignored) |
| Power-based logic | Recipe "Power drops to standby → switch off": e.g. was >1000 W, now <15 W for 2 min → off |
| Arrive home → charger 10 min | Recipe "Arrive home → charger on, off again if not charging": turns on, waits up to N min for power > X W, else switches off |
| Anything else | Advanced JSON rules: triggers `flic geo time power offline online state manual`, actions `set scene wait wait_until if notify timer cycle` |

## Connecting devices

* **SmartLife / Tuya** — cloud API. Create a project at iot.tuya.com, subscribe to *Smart Home Devices Management*, link your Smart Life account, paste Access ID/Secret/UID. Polls every 30 s (raise it if you hit API quota; power rules react at poll resolution). Sockets usually report power in 0.1 W units (`powerScale`).
* **Meross** — account used once for the device key; control and polling are then local over LAN. Give devices fixed IPs and list them as `{"name or uuid": "ip"}`.
* **Wiser** — implemented against the Drayton/Schneider **Wiser Heating** hub's local API (rooms as thermostats, smart plugs). If you meant the separate Wiser Home (Clipsal/KNX) system, that needs a different adapter.
* Notifications: set a URL (e.g. `https://ntfy.sh/your-secret-topic`); `notify` actions POST the text to it.

## Geofencing — read this
* The hub must be reachable from your phone when you arrive (usually on mobile data). Use **Tailscale** or a Cloudflare tunnel; don't port-forward plain HTTP.
* Browsers only give location over **HTTPS** and only while the page is open, so the web app is the *fallback*. The reliable way is the phone's own geofence → URL: iOS Shortcuts "Arrive/Leave" automation or Android Tasker/MacroDroid calling `/geo/<token>/home/enter` (shown on the Places tab).
* Set your Home zone first (Places → Edit → "Use my current location", or type coordinates). 100–200 m radius works well; leaving needs a 20% margin to avoid flapping.

## Honest status
Core logic (rules engine, power edge/hold triggers, offline debounce, geofence, timers, Flic, HTTP API) is covered by 20 automated tests, and the UI was exercised in a browser against the simulator. The **Tuya, Meross and Wiser adapters were written from the vendors' documented/reverse-engineered APIs but have not been run against real hardware or accounts** — expect to tweak field names/units on first connect (errors show on More → Connections and in Activity). Rule waits (`wait`, `wait_until`) are in-memory and lost on restart; device timers are persisted.

Layout: `src/core` (engine, registry, geo, timers, recipes), `src/adapters` (sim, tuya, meross, wiser), `src/server.js` (API, webhooks, SSE), `web/` (PWA).
