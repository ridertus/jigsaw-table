# Draw & Guess MVP — deployment notes

## Required order

1. Open the Supabase project used by Jigsaw Table.
2. In **SQL Editor**, paste and run `supabase/draw_guess.sql` once.
3. Confirm the SQL completed successfully and that the `draw_guess_*` tables and `dg_*` functions exist.
4. Copy the new source files into the repository:
   - `src/lobby/draw-guess.js`
   - `src/lobby/draw-guess.css`
   - `supabase/draw_guess.sql`
5. Apply the `src/lobby/build.py` update from this patch, then run:
   ```powershell
   py .\src\lobby\build.py
   node --check .\src\lobby\draw-guess.js
   git diff --check
   ```
6. Test with 2–4 different browser profiles/devices before merging/deploying the generated `lobby.html`.

## MVP behavior

- The first player who starts the session becomes controller and first drawer.
- Drawer order follows the roster order captured at session start.
- Categories: animals, food, objects, occupations, places, nature, vehicles, Thai culture, fantasy.
- Difficulty: easy / normal / hard. Timer: 60 / 90 / 120 seconds / unlimited.
- First correct guess receives 3 points; later correct guesses receive 1 point. Drawer receives 1 point per correct guess and +2 when every guesser solves.
- A solved player cannot score again in that round. Correct answer text is never sent in the broadcast payload; it is returned only by the state RPC when the viewer's supplied ID is the drawer, or after reveal.
- Live strokes are broadcast on the existing `lobby:main` channel and persisted via RPC. The game uses a separate canvas and tables; it does not touch `Board`, `board_items`, puzzle pieces, radio, or chat state.

## Important security limitation

The current lobby is guest-based: `ME.id` is generated in LocalStorage and is not a Supabase Auth identity. The RPCs check the supplied player ID against the active session roster and role, and they keep the answer out of public broadcast events, but a deliberately malicious visitor can forge another guest ID and call anon RPCs directly. Do **not** describe this MVP as cheat-proof. Strong identity and anti-cheat require a server-issued per-player credential or Supabase Auth/Edge Function flow in a later hardening phase.

## Known MVP limitation

The session roster is captured at game start. A person who joins later can watch but cannot guess in the current session. If someone disconnects during a round, the round continues until everyone remaining in the roster solves or the timer expires; reconnect recovery reloads the state and saved strokes. A dedicated disconnect grace-period/host-takeover flow is deferred.

## Manual acceptance test

1. Open the same lobby using two separate browser profiles (different `jt-me` IDs).
2. Start a session with 2 players and select two or more categories.
3. Confirm only drawer view shows the secret word.
4. Draw several strokes. Confirm the other profile sees the strokes live.
5. Submit a wrong answer, then the right answer. Confirm only the right answer gets points and the answer input locks.
6. With 3–4 profiles, confirm first guess gets +3, later guesses +1, drawer gets +1 per correct guess and a +2 all-solved bonus.
7. Test timeout, skip, next round, end game, refresh/reconnect and return to the lobby.
8. Re-test the existing puzzle, shared whiteboard, YouTube radio, chat and room presence.
