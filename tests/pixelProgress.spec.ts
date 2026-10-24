import { describe, expect, it } from "vitest";
import { filledCells, runningCells } from "@/ui/pixelProgress";

// Shorthand: "#" on, "+" trail, "." off.
const draw = (cells: string[]) => cells.map((c) => (c === "on" ? "#" : c === "trail" ? "+" : ".")).join("");

describe("filledCells", () => {
  it("fills whole cells from the left and shows a partly done cell half lit", () => {
    expect(draw(filledCells(8, 0))).toBe("........");
    expect(draw(filledCells(8, 0.25))).toBe("##......");
    expect(draw(filledCells(8, 0.3))).toBe("##+.....");
    expect(draw(filledCells(8, 1))).toBe("########");
  });

  it("clamps fractions outside 0 to 1 and treats NaN as nothing done", () => {
    expect(draw(filledCells(4, -1))).toBe("....");
    expect(draw(filledCells(4, 2))).toBe("####");
    expect(draw(filledCells(4, Number.NaN))).toBe("....");
  });
});

describe("runningCells", () => {
  it("lights nothing before the first item", () => {
    expect(draw(runningCells(6, 0))).toBe("......");
  });

  it("steps one cell per item with a two-cell trail", () => {
    expect(draw(runningCells(6, 1))).toBe("#.....");
    expect(draw(runningCells(6, 2))).toBe("+#....");
    expect(draw(runningCells(6, 4))).toBe(".++#..");
  });

  it("wraps round at the end, trail included", () => {
    expect(draw(runningCells(6, 6))).toBe("...++#");
    expect(draw(runningCells(6, 7))).toBe("#...++");
    expect(draw(runningCells(6, 8))).toBe("+#...+");
  });

  it("never lets the trail cover the moving cell on a very short bar", () => {
    expect(draw(runningCells(2, 5))).toBe("#+");
    expect(draw(runningCells(1, 3))).toBe("#");
  });
});
