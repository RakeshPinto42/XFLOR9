/** Saanp (snake) game rules, pure and framework-free so they can be unit-tested. */

export type Dir = "up" | "down" | "left" | "right";
export interface Point {
  x: number;
  y: number;
}
export interface SnakeState {
  size: number;
  /** Head first. */
  snake: Point[];
  dir: Dir;
  /** Direction requested since the last step; applied on the next step. */
  nextDir: Dir;
  food: Point | null;
  score: number;
  over: boolean;
}

const DELTA: Record<Dir, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };

export function newSnakeGame(size = 16, rng: () => number = Math.random): SnakeState {
  const mid = Math.floor(size / 2);
  const snake = [
    { x: mid, y: mid },
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid },
  ];
  return { size, snake, dir: "right", nextDir: "right", food: placeFood(size, snake, rng), score: 0, over: false };
}

/** Queue a turn; reversing straight into the body is ignored. */
export function turn(state: SnakeState, dir: Dir): SnakeState {
  if (state.over || dir === OPPOSITE[state.dir]) return state;
  return { ...state, nextDir: dir };
}

export function step(state: SnakeState, rng: () => number = Math.random): SnakeState {
  if (state.over) return state;
  const dir = state.nextDir;
  const head = state.snake[0];
  const next = { x: head.x + DELTA[dir].x, y: head.y + DELTA[dir].y };
  const eats = state.food !== null && next.x === state.food.x && next.y === state.food.y;
  // The tail moves away this step unless the snake grows, so it is not an obstacle.
  const body = eats ? state.snake : state.snake.slice(0, -1);
  const hitsWall = next.x < 0 || next.y < 0 || next.x >= state.size || next.y >= state.size;
  if (hitsWall || body.some((p) => p.x === next.x && p.y === next.y)) {
    return { ...state, dir, over: true };
  }
  const snake = [next, ...body];
  if (!eats) return { ...state, dir, snake };
  const food = placeFood(state.size, snake, rng);
  // A full board means the player has won; the game ends there.
  return { ...state, dir, snake, food, score: state.score + 1, over: food === null };
}

function placeFood(size: number, snake: Point[], rng: () => number): Point | null {
  const taken = new Set(snake.map((p) => p.y * size + p.x));
  const free: number[] = [];
  for (let i = 0; i < size * size; i++) if (!taken.has(i)) free.push(i);
  if (free.length === 0) return null;
  const i = free[Math.floor(rng() * free.length)];
  return { x: i % size, y: Math.floor(i / size) };
}
