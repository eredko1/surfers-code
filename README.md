# SURFERS CONEY 🌊🎡

An open-world surf game — with **Coney Island on the horizon**. One HTML file plus one island module. No build step, no backend, no accounts.

Surf the tropical reef breaks, then jet-ski north: Coney Island materializes out of the haze — boardwalk, Wonder Wheel, Cyclone, Parachute Jump, elevated subway, streets full of yellow cabs, and crowds strolling the planks.

## The Coney loop

- **Catch the Coney Island Break** (`B` cycles to it, or hit the CONEY ISLAND button on the title screen) — it peels right toward the sand.
- **Ride all the way in.** When your board touches the shallows you step off automatically and just keep walking up the beach — no button needed.
- **Ride the rides** — Wonder Wheel, Cyclone (hands up!), Carousel, all in first person (`C` for third person). Hop off anywhere.
- **Take the subway** — real Brighton line stops: Coney Island–Stillwell Av, W 8 St–NY Aquarium, Ocean Pkwy, Brighton Beach. Trains brake into the platforms, doors chime, stops are announced.
- **Carnival**: play ring toss on the boardwalk (time your throws!) and win a plushie; grab a Nathan's Famous hot dog for a speed boost.
- **Jack a cab** GTA-style on the city streets — `G` near a road, drive with `W`, handbrake-drift with `Space`, park and walk away.
- **Night** (`K` cycles midday → golden hour → night): stars come out, apartment windows and ride bulbs glow, and a synchronized **fireworks show** bursts over the water — everyone in your room sees the same show.
- **Wildlife**: crabs on the sand, sea turtles cruising the island shallows (they dive if you get close), flying fish bursting past your jet ski.
- **Style system**: cutbacks and snaps are scored by name; vary your tricks to fill the style meter and enter FLOW for 2× points.

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
