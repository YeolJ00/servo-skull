# Servo-skull: a 40k game host

A static web app that hosts a game of Warhammer 40,000 (11th edition) for two players at the table. It says which stage of the game you're in and what to do next, tracks CP, VP, and unit state, and resolves dice.

See `CLAUDE.md` for the full design, constraints, and roadmap.

```bash
npm install
npm run dev        # add --host to open it on a phone over LAN
npm test
npm run check
npm run build
```

Pushes to `main` deploy to <https://yeolj00.github.io/servo-skull/> through GitHub Actions (set Pages → Source to "GitHub Actions" once).

Rules data comes from Wahapedia's data export and is imported per device. It is never committed. Powered by [Wahapedia](https://wahapedia.ru/).
