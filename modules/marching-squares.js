/**
 * Linearly interpolates between two points based on the value of the field at those points
 * relative to the threshold.
 */
function interpolate(p1, v1, p2, v2, threshold) {
  if (Math.abs(threshold - v1) < 0.00001) return p1;
  if (Math.abs(threshold - v2) < 0.00001) return p2;
  if (Math.abs(v1 - v2) < 0.00001) return p1;

  const t = (threshold - v1) / (v2 - v1);
  return {
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t,
  };
}

class MarchingSquares {
  /**
   * Generates connected paths (polylines) for the isoline at the given threshold.
   *
   * @returns Array of paths, where each path is an array of Points.
   */
  static generateIsolines(values, threshold, cellWidth, cellHeight) {
    const cols = values.length;
    const rows = values[0].length;

    // Graph Data Structures
    // Maps a unique "Edge ID" (string) to the calculated coordinate (Point)
    const pointsCache = new Map();
    // Adjacency list: Maps "Edge ID" to list of connected "Edge IDs"
    const adjacency = new Map();

    // Helper to create a unique ID for a grid edge
    // type: 'h' for horizontal edge (y constant), 'v' for vertical edge (x constant)
    const getEdgeId = (xIdx, yIdx, type) => `${type}:${xIdx}:${yIdx}`;

    // Helper to add a bidirectional connection between two edge nodes
    const connect = (id1, id2) => {
      if (!adjacency.has(id1)) adjacency.set(id1, []);
      if (!adjacency.has(id2)) adjacency.set(id2, []);
      adjacency.get(id1).push(id2);
      adjacency.get(id2).push(id1);
    };

    // Helper to lazily calculate and retrieve a point on a grid edge
    const getPoint = (col, row, type, val1, val2, p1, p2) => {
      const id = getEdgeId(col, row, type);
      if (!pointsCache.has(id)) {
        pointsCache.set(id, interpolate(p1, val1, p2, val2, threshold));
      }
      return id;
    };

    for (let i = 0; i < cols - 1; i++) {
      for (let j = 0; j < rows - 1; j++) {
        const x = i * cellWidth;
        const y = j * cellHeight;

        const val_a = values[i][j]; // Top-Left
        const val_b = values[i + 1][j]; // Top-Right
        const val_c = values[i + 1][j + 1]; // Bottom-Right
        const val_d = values[i][j + 1]; // Bottom-Left

        let state = 0;
        if (val_a >= threshold) state |= 8;
        if (val_b >= threshold) state |= 4;
        if (val_c >= threshold) state |= 2;
        if (val_d >= threshold) state |= 1;

        if (state === 0 || state === 15) continue;

        // Edge IDs for the current cell
        // N: Horizontal edge at (i, j)
        const getIdN = () =>
          getPoint(i, j, "h", val_a, val_b, { x, y }, { x: x + cellWidth, y });
        // E: Vertical edge at (i+1, j)
        const getIdE = () =>
          getPoint(
            i + 1,
            j,
            "v",
            val_b,
            val_c,
            { x: x + cellWidth, y },
            { x: x + cellWidth, y: y + cellHeight }
          );
        // S: Horizontal edge at (i, j+1)
        const getIdS = () =>
          getPoint(
            i,
            j + 1,
            "h",
            val_d,
            val_c,
            { x, y: y + cellHeight },
            { x: x + cellWidth, y: y + cellHeight }
          );
        // W: Vertical edge at (i, j)
        const getIdW = () =>
          getPoint(i, j, "v", val_a, val_d, { x, y }, { x, y: y + cellHeight });

        switch (state) {
          case 1:
            connect(getIdW(), getIdS());
            break;
          case 2:
            connect(getIdE(), getIdS());
            break;
          case 3:
            connect(getIdW(), getIdE());
            break;
          case 4:
            connect(getIdN(), getIdE());
            break;
          case 5: // Saddle
            connect(getIdW(), getIdN());
            connect(getIdS(), getIdE());
            break;
          case 6:
            connect(getIdN(), getIdS());
            break;
          case 7:
            connect(getIdW(), getIdN());
            break;
          case 8:
            connect(getIdW(), getIdN());
            break;
          case 9:
            connect(getIdN(), getIdS());
            break;
          case 10: // Saddle
            connect(getIdW(), getIdS());
            connect(getIdN(), getIdE());
            break;
          case 11:
            connect(getIdN(), getIdE());
            break;
          case 12:
            connect(getIdW(), getIdE());
            break;
          case 13:
            connect(getIdE(), getIdS());
            break;
          case 14:
            connect(getIdW(), getIdS());
            break;
        }
      }
    }

    // Stitching Segments into Paths
    const paths = [];
    const visited = new Set();

    for (const [startId, _] of adjacency) {
      if (visited.has(startId)) continue;

      // Initialize path with the starting node
      const deque = [startId];
      visited.add(startId);

      // 1. Expand towards one direction (Right)
      let rightHead = startId;
      while (true) {
        const neighbors = adjacency.get(rightHead) || [];
        const unvisited = neighbors.find((id) => !visited.has(id));

        if (unvisited) {
          visited.add(unvisited);
          deque.push(unvisited);
          rightHead = unvisited;
        } else {
          // Check for loop closure: if a neighbor is the start of our deque
          if (deque.length > 2 && neighbors.includes(deque[0])) {
            deque.push(deque[0]); // Close the physical loop
          }
          break;
        }
      }

      // 2. Expand towards the other direction (Left)
      // This handles cases where we started in the middle of an open line
      let leftHead = startId;
      while (true) {
        const neighbors = adjacency.get(leftHead) || [];
        const unvisited = neighbors.find((id) => !visited.has(id));

        if (unvisited) {
          visited.add(unvisited);
          deque.unshift(unvisited);
          leftHead = unvisited;
        } else {
          break;
        }
      }

      // Convert IDs back to Points
      const pathPoints = deque.map((id) => pointsCache.get(id));
      if (pathPoints.length > 1) {
        paths.push(pathPoints);
      }
    }

    return paths;
  }
}

export { MarchingSquares };
