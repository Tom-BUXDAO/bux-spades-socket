/**
 * Custom React hooks for the BUX Spades game
 * 
 * This file exports all custom hooks used in the application.
 * Import hooks from this file rather than from individual files.
 */

// Export all hook implementations
export { default as useResizeObserver } from './useResizeObserver';
export { default as useWindowSize } from './useWindowSize';
export { default as useLocalStorage } from './useLocalStorage';
export { default as useGameState } from './useGameState';
export { default as useSocket } from './useSocket';

// Export type definitions
export type { Size } from './useResizeObserver';
export type { WindowSize } from './useWindowSize';
export type { GameState, Player } from './useGameState'; 