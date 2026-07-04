# SURFERS CONEY 🌊🎡

An open-world surf game — with **Coney Island on the horizon**. One HTML file plus one island module. No build step, no backend, no accounts.

Surf the tropical reef breaks, then jet-ski north: Coney Island materializes out of the haze — boardwalk, Wonder Wheel, Cyclone, Parachute Jump, elevated subway, streets full of yellow cabs, and crowds strolling the planks.

## The Coney loop

- **Catch the Coney Island Break** (`B` cycles to it, or hit the CONEY ISLAND button on the title screen) — it peels right toward the sand.
- **Ride all the way in.** When your board touches the shallows you step off automatically and just keep walking up the beach — no button needed.
- **Walk mode** (`G`, or the WALK button on phones): stroll the sand, up onto the boardwalk, into the streets. Locals chat with you when you get close.
- **Wade back into the water** and you're automatically paddling again. Your board or jet ski stays floating where you left it — walk back and press `G` to remount.
- **Golden hour** (`K`): the rides and boardwalk bulbs glow against the sunset.

## Controls

| Keyboard | Action |
| --- | --- |
| `W` `A` `S` `D` | paddle / carve / stall — or walk and turn on land |
| `Space` | pop up · air (hold = grab) · jump on land |
| `G` | dismount / remount (walk mode) |
| `J` | jet ski |
| `B` | next break (4 reefs + Coney Island) |
| `T` / `C` / `K` / `M` / `R` | auto-catch · camera · golden hour · sound · reset |

Phones: virtual joystick + **POP / JET SKI / BREAK / WALK** buttons.

## Multiplayer

Same as Surfers Code: type a name and a shared room word — everyone in the room rides the same wall-clock-synced ocean, sees each other (surfing, jet-skiing, *and walking the boardwalk*), shares a live leaderboard, and scores points crashing into each other.

## Running locally

```bash
npx -y serve . -p 3000   # or: python3 -m http.server 3000
```

Open `http://localhost:3000`. Needs internet for the Three.js CDN. The city assembles progressively in the background over the first seconds — the ocean is playable instantly.
