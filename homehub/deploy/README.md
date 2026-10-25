# Running HomeHub on a Raspberry Pi (3B / 3B+ / 4 / Zero 2 W)

## 1. Prepare the Pi (about 15 min)
1. Buy a 5V 2.5A power supply and a 16 GB+ microSD card with the Pi.
2. On your PC install **Raspberry Pi Imager**. Choose *Raspberry Pi OS Lite (64-bit)*.
3. Click the cog / "Edit settings" before writing: hostname `homehub`, enable **SSH**, set a username + strong password, enter your **Wi-Fi** (or just plug in Ethernet).
4. Put the card in, power on, wait ~2 min.
5. In your router, give the Pi a **fixed IP** (DHCP reservation). Meross/Wiser rely on fixed IPs too.
6. From your PC: `ssh <user>@homehub.local`

## 2. Install HomeHub
```bash
sudo apt update && sudo apt install -y git
git clone https://github.com/immmahh-sketch/carecircle.git
cd carecircle && git checkout claude/smart-home-app-bw9cvn
sudo bash homehub/deploy/install.sh
```
(If the repo is private, `git clone` asks for credentials: use your GitHub username and a personal access token with read access to this repo.)

It installs Node, starts HomeHub as a service that restarts on crash and on boot, and prints the **admin key**. Open `http://<pi-ip>:8787/` on your phone, enter the key, then add your accounts under *More → Connections*.
Lost the key? `sudo grep adminKey /var/lib/homehub/homehub.json`

## 3. Reach it from anywhere: home.letsquiz.uk
Needs letsquiz.uk's DNS on Cloudflare (free; Cloudflare dashboard → Add a site → follow the nameserver change at your registrar).
```bash
sudo bash homehub/deploy/tunnel.sh home.letsquiz.uk
```
Open the login URL it prints, authorise letsquiz.uk, done. No router ports are opened.

**Lock it down (do this):** Cloudflare dashboard → Zero Trust → Access → Applications → *Add a self-hosted application* → `home.letsquiz.uk` → policy: **Allow** → Emails: your email. Then only you (with a one-time email code) can even reach the login page.
Exception: the phone/Flic webhooks (`/hook/...`, `/geo/...`) must work without a browser login. Add a second Access application for paths `home.letsquiz.uk/hook` and `home.letsquiz.uk/geo` with policy **Bypass → Everyone**; those paths are protected by their own long secret keys. (Keep Access on everything else.)

## 4. Day to day
| Task | Command |
|---|---|
| Update to latest code (tests first, auto-rollback) | `sudo bash homehub/deploy/update.sh` |
| Logs | `journalctl -u homehub -f` |
| Restart | `sudo systemctl restart homehub` |
| Back up rules + credentials | `sudo bash homehub/deploy/backup.sh /some/folder` |
| Health | `curl localhost:8787/healthz` |

## Notes
* SD cards wear out if written constantly; HomeHub writes its small JSON file only when something changes. Keep a backup anyway.
* Everything runs as an unprivileged `homehub` user with a locked-down systemd profile; its data (including cloud credentials) is in `/var/lib/homehub`, readable only by that user.
* These scripts are syntax-checked but I could not run them on a real Pi from my environment: if a step errors, send me the output.
