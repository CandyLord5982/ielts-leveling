# New Pet Game Checklist

When adding a new mini-game, make sure to update ALL of the following:

## 1. Game Component
- Accept `scoreToBeat` prop (object: `{ score, name }` or `null`)
- Accept `hideClose` prop for PvP mode
- Add score-to-beat progress bar in the HUD (copy pattern from PetAstroBlast or PetMatchGame)
- Call `onGameEnd(score)` when game finishes

## 2. PetDisplay.jsx (Normal Training Mode)
- Import the game component
- Add game key to `gameLeaderboards` initial state (line ~89)
- Add game key to `enabledGames` default array (line ~91)
- Add game picker button in the grid (with `fetchGameLeaderboard('yourgame')` in onClick)
- Add `showGame === 'yourgame'` render block with `scoreToBeat` prop
- Wire `onGameEnd={(score) => handleGameEnd(score, 'yourgame')}` (this saves to `training_scores` table)

## 3. PvPChallengeModal.jsx (PvP - Challenger)
- Import the game component
- Add game to `GAMES` array (line ~140)
- Add `case 'yourgame':` in `renderGame()` switch — `commonProps` already includes `scoreToBeat`

## 4. PvPIncomingBanner.jsx (PvP - Responder)
- Import the game component
- Add `case 'yourgame':` in `renderGame()` switch — `commonProps` already includes `scoreToBeat`

## 5. Admin & Leaderboard
- `LeaderboardSettings.jsx`: Add to `GAME_TYPES` array AND `TRAINING_GAMES` array
- `Leaderboard.jsx`: Add to `GAME_LABELS` object

## Key Notes
- `scoreToBeat` is used by: PetWordScramble, PetAstroBlast, PetMatchGame
- `leaderboard` (array) is used by: PetWhackMole (it computes `nextToBeat` internally) — if your game uses this pattern, also pass `leaderboard` in PvP
- Scores are saved to `training_scores` table via `handleGameEnd()` in PetDisplay
- Game enable/disable is controlled by `site_settings` key `pet_training_enabled_games` (JSON array)
