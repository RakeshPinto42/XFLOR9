import { describe, expect, it } from "vitest";
import { newSnakeGame, step, turn } from "./snake";
import { flagsLeft, newMinesGame, reveal, toggleFlag } from "./mines";

const fixed = (v: number) => () => v;
/** Small seeded generator so mine layouts are scattered but repeatable. */
function seeded(seed = 7) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
}

describe("snake", () => {
  it("moves one cell per step and ignores reversing into itself", () => {
    let s = newSnakeGame(10, fixed(0));
    s = turn(s, "left"); // reverse: ignored
    s = step(s, fixed(0));
    expect(s.snake[0]).toEqual({ x: 6, y: 5 });
    expect(s.snake).toHaveLength(3);
  });

  it("grows and scores when it eats", () => {
    let s = newSnakeGame(10, fixed(0));
    s = { ...s, food: { x: 6, y: 5 } };
    s = step(s, fixed(0));
    expect(s.score).toBe(1);
    expect(s.snake).toHaveLength(4);
    expect(s.food).not.toBeNull();
    expect(s.snake.some((p) => p.x === s.food!.x && p.y === s.food!.y)).toBe(false);
  });

  it("ends at a wall", () => {
    let s = newSnakeGame(10, fixed(0));
    for (let i = 0; i < 10 && !s.over; i++) s = step(s, fixed(0));
    expect(s.over).toBe(true);
    expect(s.snake[0].x).toBe(9);
  });

  it("ends when it runs into its own body", () => {
    let s = newSnakeGame(10, fixed(0));
    s = { ...s, food: null, snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }] };
    s = step(turn(s, "down"), fixed(0));
    expect(s.over).toBe(true);
  });

  it("may move into the cell its tail is leaving", () => {
    let s = newSnakeGame(10, fixed(0));
    s = { ...s, food: null, snake: [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }], dir: "left", nextDir: "left" };
    s = step(turn(s, "down"), fixed(0));
    expect(s.over).toBe(false);
  });
});

describe("mines", () => {
  it("first reveal is always safe and opens an area", () => {
    for (const r of [0, 0.5, 0.999]) {
      const s = reveal(newMinesGame(9, 9, 10), 40, fixed(r));
      expect(s.status === "playing" || s.status === "won").toBe(true);
      expect(s.cells.filter((c) => c.mine)).toHaveLength(10);
      expect(s.cells[40].open).toBe(true);
      expect(s.cells[40].near).toBe(0);
    }
  });

  it("revealing a mine loses and shows all mines", () => {
    let s = reveal(newMinesGame(9, 9, 10), 0, seeded());
    const mine = s.cells.findIndex((c) => c.mine);
    s = reveal(s, mine);
    expect(s.status).toBe("lost");
    expect(s.cells.filter((c) => c.mine).every((c) => c.open)).toBe(true);
  });

  it("opening every safe cell wins", () => {
    let s = reveal(newMinesGame(9, 9, 10), 0, seeded());
    s.cells.forEach((c, i) => {
      if (!c.mine) s = reveal(s, i);
    });
    expect(s.status).toBe("won");
  });

  it("flags block reveals and count down", () => {
    let s = reveal(newMinesGame(9, 9, 10), 0, seeded());
    const closed = s.cells.findIndex((c) => !c.open);
    s = toggleFlag(s, closed);
    expect(flagsLeft(s)).toBe(9);
    expect(reveal(s, closed)).toBe(s);
    s = toggleFlag(s, closed);
    expect(flagsLeft(s)).toBe(10);
  });
});
