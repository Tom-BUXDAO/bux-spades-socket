import { Server } from 'socket.io';
import { Server as NetServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { NextApiResponse } from "next";
import type { GameState, Player, Card, GameStatus } from "@/types/game";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const games = new Map<string, GameState>();

let io: SocketIOServer | null = null;

if (typeof window === "undefined" && !io) {
  io = new SocketIOServer({
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("Client connected");

    socket.on("create_game", (data: { userId: string }) => {
      try {
        const { userId } = data;
        if (!userId) {
          socket.emit('error', { message: 'User ID is required' });
          return;
        }

        // Generate a unique game ID
        const gameId = Math.random().toString(36).substring(7);
        const player: Player = {
          id: userId,
          name: `Player ${userId.substring(0, 4)}`,
          hand: [],
          tricks: 0,
          team: 1 as 1 | 2,
          position: 0
        };
        const newGame: GameState = {
          id: gameId,
          status: "WAITING",
          players: [player],
          currentPlayer: "",
          currentTrick: [],
          tricks: [],
          completedTricks: [],
          hands: {},
          bids: {},
          scores: { team1: 0, team2: 0 },
          dealerPosition: 0,
          northSouthTricks: 0,
          eastWestTricks: 0,
          currentTrickCardPlayers: [],
          cardPlayers: {},
          createdAt: new Date().toISOString()
        };

        // Store the game in memory
        games.set(gameId, newGame);

        // Join the game room
        socket.join(gameId);

        // Emit the game state to the creator
        socket.emit('game_created', newGame);

        // Broadcast the updated game list to all clients
        if (io) {
          io.emit('game_list_updated', Array.from(games.values()));
        }
      } catch (error) {
        console.error('Error creating game:', error);
        socket.emit('error', { message: 'Failed to create game' });
      }
    });

    socket.on("join_game", async ({ gameId, userId }) => {
      try {
        const game = games.get(gameId);
        if (!game || game.players.length >= 4) return;

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true },
        });

        if (!user) return;

        const position = game.players.length;
        const team = (position % 2 + 1) as 1 | 2;
        game.players.push({
          id: user.id,
          name: user.name || "Unknown",
          hand: [],
          tricks: 0,
          team,
          position
        });

        if (game.players.length === 4) {
          game.status = "BIDDING";
          game.dealerPosition = 3;
        }

        games.set(gameId, game);
        if (io) {
          io.emit("game_list_updated", Array.from(games.values()));
          io.to(gameId).emit("game_updated", game);
        }
      } catch (error) {
        console.error("Error joining game:", error);
      }
    });

    socket.on("play_card", async ({ gameId, cardIndex }) => {
      if (!io) return;
      
      const game = games.get(gameId);
      if (!game) return;

      const player = game.players.find(p => p.id === socket.id);
      if (!player) return;

      // Get the card from the player's hand
      const card = player.hand[cardIndex];
      if (!card) return;

      // Remove card from player's hand
      player.hand.splice(cardIndex, 1);

      // Add the card to the current trick
      game.currentTrick.push({
        ...card,
        playedBy: {
          id: player.id,
          name: player.name,
          position: player.position
        }
      });

      // Check if trick is complete
      if (game.currentTrick.length === 4) {
        const winningCard = determineTrickWinner(game.currentTrick);
        const winningPlayer = game.players.find(p => p.id === winningCard.playedBy?.id);
        
        if (winningPlayer) {
          winningPlayer.tricks = (winningPlayer.tricks || 0) + 1;
          
          // Emit trick complete event for animation
          const ioInstance = io;
          ioInstance.to(gameId).emit("trick_complete", {
            winningCard,
            winningPlayer: winningPlayer.id
          });

          // Wait for animation before clearing trick
          setTimeout(() => {
            game.currentTrick = [];
            game.currentPlayer = winningPlayer.id;
            
            // Check if hand is complete
            const allCardsPlayed = game.players.every(p => p.hand.length === 0);
            if (allCardsPlayed) {
              const scores = calculateHandScore(game.players);
              game.scores = {
                team1: scores.team1.score,
                team2: scores.team2.score
              };
              
              // Check if game is complete
              const team1Won = scores.team1.score >= 500;
              const team2Won = scores.team2.score >= 500;
              const isTied = scores.team1.score === scores.team2.score;
              
              if ((team1Won || team2Won) && !isTied) {
                game.status = "FINISHED" as GameStatus;
                game.winningTeam = team1Won ? "team1" : "team2";
              } else {
                // Start a new hand
                game.status = "BIDDING" as GameStatus;
                game.dealerPosition = (game.dealerPosition + 1) % 4;
                game.currentPlayer = game.players[game.dealerPosition].id;
              }
              
              ioInstance.to(gameId).emit("game_state_update", game);
            } else {
              ioInstance.to(gameId).emit("game_state_update", game);
            }
          }, 2000); // 2 second delay for animation
        }
      } else {
        // Move to next player
        const currentPlayerIndex = game.players.findIndex(p => p.id === socket.id);
        const nextPlayerIndex = (currentPlayerIndex + 1) % 4;
        game.currentPlayer = game.players[nextPlayerIndex].id;
        
        const ioInstance = io;
        ioInstance.to(gameId).emit("game_state_update", game);
      }
    });

    socket.on("update_scores", ({ gameId, team1Score, team2Score, startNewHand }) => {
      try {
        const game = games.get(gameId);
        if (!game) return;
        
        // Update scores
        game.scores.team1 = team1Score;
        game.scores.team2 = team2Score;
        
        if (startNewHand) {
          // Reset for new hand
          game.status = "BIDDING";
          game.dealerPosition = (game.dealerPosition + 1) % 4;
          game.currentPlayer = game.players[game.dealerPosition].id;
          game.currentTrick = [];
          game.tricks = [];
          game.completedTricks = [];
          game.bids = {};
          
          // Reset player states
          game.players.forEach(player => {
            player.hand = [];
            player.tricks = 0;
            player.bid = undefined;
          });
        }
        
        // Update the game state
        games.set(gameId, game);
        if (io) {
          io.to(gameId).emit("game_updated", game);
        }
      } catch (error) {
        console.error("Error updating scores:", error);
        socket.emit("error", { message: "Failed to update scores" });
      }
    });

    socket.on("end_game", ({ gameId }) => {
      try {
        const game = games.get(gameId);
        if (!game) return;
        
        // Set game status to complete
        game.status = "FINISHED";
        
        // Update the game state
        games.set(gameId, game);
        if (io) {
          io.to(gameId).emit("game_updated", game);
          
          // Remove the game from the active games list
          games.delete(gameId);
          io.emit("game_list_updated", Array.from(games.values()));
        }
      } catch (error) {
        console.error("Error ending game:", error);
        socket.emit("error", { message: "Failed to end game" });
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected");
    });
  });

  io.listen(3001);
  console.log("Socket.io server started on port 3001");
}

export async function GET(req: Request) {
  return new Response("Socket server running", {
    headers: {
      "Access-Control-Allow-Origin": "http://localhost:3000",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}

export async function OPTIONS(req: Request) {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "http://localhost:3000",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}

// Helper function to determine the winner of a trick
function determineTrickWinner(trick: Card[]): Card {
  const leadSuit = trick[0].suit;
  let winningCard = trick[0];
  
  for (let i = 1; i < trick.length; i++) {
    const card = trick[i];
    if (card.suit === leadSuit && card.rank > winningCard.rank) {
      winningCard = card;
    }
  }
  
  return winningCard;
}

// Helper function to calculate hand score
function calculateHandScore(players: Player[]): { team1: { score: number }, team2: { score: number } } {
  const team1Score = players
    .filter(p => p.team === 1)
    .reduce((sum, p) => sum + (p.tricks || 0), 0);
    
  const team2Score = players
    .filter(p => p.team === 2)
    .reduce((sum, p) => sum + (p.tricks || 0), 0);
    
  return {
    team1: { score: team1Score },
    team2: { score: team2Score }
  };
} 