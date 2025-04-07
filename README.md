# BUX Spades Socket.IO Server

This is the WebSocket server for the BUX Spades game. It handles real-time game state updates and player interactions.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. Update the `.env` file with your configuration:
   - `PORT`: The port to run the server on (default: 3001)
   - `CLIENT_URL`: The URL of your Next.js client app

## Development

Run the development server:
```bash
npm run dev
```

## Production

Build the project:
```bash
npm run build
```

Start the production server:
```bash
npm start
```

## Deployment

This server is designed to be deployed on Railway.app:

1. Create a new project on Railway.app
2. Connect your GitHub repository
3. Add the following environment variables:
   - `PORT`: Railway will set this automatically
   - `CLIENT_URL`: Set to your Vercel app URL (e.g., https://bux-spades.vercel.app)
4. Deploy!

## Socket Events

### Client -> Server

- `create_game`: Create a new game
  ```typescript
  {
    gameId: string;
    userId: string;
    user: {
      id: string;
      name: string;
    };
  }
  ```

- `join_game`: Join an existing game
  ```typescript
  {
    gameId: string;
    userId: string;
    testPlayer?: {
      name: string;
      team: 1 | 2;
      browserSessionId: string;
    };
  }
  ```

### Server -> Client

- `game_created`: Emitted when a game is created
- `games_update`: Emitted when the games list changes
- `game_update`: Emitted when a game's state changes
- `error`: Emitted when an error occurs 