# Checkmate Manager

A professional round-robin chess tournament manager built with React, TypeScript, and Firebase.

🔗 **Live app:** https://denisabirlica.github.io/round_robin_chess_manager

## Features

- **Live Standings** — real-time leaderboard with professional tiebreakers (Direct Encounter → Sonneborn-Berger → Most Wins → Wins with Black)
- **Round-Robin Engine** — automated pairing for Single and Double Round Robin formats
- **Cloud Sync** — save and load tournaments via Firestore; share by Tournament ID (requires Google sign-in)
- **Cross Table** — head-to-head results matrix

## How to use

1. Add players to your tournament.
2. Generate the rounds.
3. Enter results as games are finished.
4. Watch the standings update automatically!

## Tech Stack

- React 18 + TypeScript
- Vite
- Firebase (Auth + Firestore)
- Tailwind CSS
- Framer Motion
