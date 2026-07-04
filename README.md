# SURFERS CODE 🌊

An open-world multiplayer surf game in **a single 120 KB HTML file**. No build, no assets, no backend, no accounts — everything (ocean, sky, characters, barrels, audio) is generated procedurally in code.

**Play:** open `index.html`, or the hosted link. Works on desktop and phones.

## Multiplayer

Type a **name** and a **room word** on the start screen. Everyone who enters the same room word rides the *same ocean* — waves and sets are synchronized to the wall clock, so you can split the same barrel. Live leaderboard of everyone in the room. Crash into each other (board or jet ski) for points.

Share a room directly: `...?room=YOURWORD`

Position packets travel through a public MQTT relay over WebSockets — nothing is stored, nobody registers, closing the tab removes you from the lineup. Pick a room word your friends can remember and strangers can't guess.

## Controls

| Desktop | Action |
| --- | --- |
| `W` | paddle / pump |
| `A` `D` | carve · stall deeper / race the section · spin in the air |
| `Space` | pop up · air off the lip (hold = grab) |
| `S` | slow / kick out |
| `J` | jet ski |
| `B` | next reef break |
| `T` | auto-catch |
| `C` / `K` / `F` / `M` / `R` | camera · golden hour · wireframe · sound · reset |

On phones: virtual joystick (push up to paddle, pull back to stall) + **POP / JET SKI / BREAK** buttons.

## How it fits in one small file

- **Ocean** — Gerstner wave math evaluated in a GPU vertex shader; sky and water reflections share one GLSL `skyColor()` function
- **Barrels** — a 124×30 point grid bent through a curling cross-section every frame, synced to an 18-second set cycle with traveling swell lumps
- **Characters** — ~15 primitive capsules posed by procedural animation (paddle, ride, barrel stall, airs, wipeouts)
- **Audio** — synthesized live with Web Audio (filtered noise ocean, sawtooth jet engine, dolphin chirps)
- **Radar, spray, wakes, leash** — canvas textures and dynamic buffers, all built at load

The only external dependency is Three.js, streamed from a CDN — so the game needs internet the first time it opens.

---

Built with [Claude Code](https://claude.com/claude-code).
