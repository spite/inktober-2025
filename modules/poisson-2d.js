import Maf from "maf";
import { Vector2 } from "three";

class Poisson2D {
  constructor(width = 512, height = 512, r = 4, k = 30) {
    this.r = r;
    this.k = k;
    this.cellSize = this.r / Math.sqrt(2); // 2 = dimensions
    this.width = width;
    this.height = height;
    this.cols = Math.floor(this.width / this.cellSize);
    this.rows = Math.floor(this.height / this.cellSize);
    this.grid = [];
    this.activeList = [];
    for (let i = 0; i < this.rows * this.cols; i++) {
      this.grid[i] = null;
    }

    const x = Math.random() * width;
    const y = Math.random() * height;
    const cell = this.cellIndex(x, y);
    const p = new Vector2(x, y);
    this.grid[cell.index] = p;
    this.activeList.push(p);
  }

  cellIndex(x, y) {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    return { col, row, index: col + row * this.cols };
  }

  calculate() {
    while (this.activeList.length) {
      this.calculatePoint();
    }
    return this.grid.filter((v) => v !== null);
  }

  calculatePoint() {
    //console.log(this.activeList.length);
    if (this.activeList.length > 0) {
      const randIndex = Math.floor(Math.random() * this.activeList.length);
      const pos = this.activeList[randIndex];

      let found = false;
      for (let n = 0; n < this.k; n++) {
        const sample = new Vector2();
        sample.set(Maf.randomInRange(-1, 1), Maf.randomInRange(-1, 1));
        sample.setLength(Maf.randomInRange(this.r, 2 * this.r));
        sample.add(pos);

        const cell = this.cellIndex(sample.x, sample.y);
        if (
          cell.col > -1 &&
          cell.row > -1 &&
          cell.col < this.cols &&
          cell.row < this.rows &&
          this.grid[cell.col + cell.row * this.cols] == null
        ) {
          let ok = true;
          for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
              const index = cell.col + i + (cell.row + j) * this.cols;
              const neighbour = this.grid[index];
              if (neighbour) {
                const d = neighbour.distanceTo(sample);
                if (d < this.r) {
                  ok = false;
                }
              }
            }
          }
          if (ok) {
            found = true;
            this.grid[cell.col + cell.row * this.cols] = sample;
            this.activeList.push(sample);
          }
        }
      }
      if (!found) {
        this.activeList.splice(randIndex, 1);
      }
    }
  }
}

export { Poisson2D };
