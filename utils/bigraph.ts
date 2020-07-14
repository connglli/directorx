export class BiGraphError extends Error {}

/** BiGraph is a weight and directed bi-part graph, composing
 * of a left subgraph, a right subgraph, and their full connected
 * edges (along with a weight)
 * 
 * The #match() method matches the BiGraph with KM algorithm. One
 * can then fetch the matches using the #getMatch() method
 * 
 * The `weights` is expected to be an integer, or the algorithm may
 * never stop due to floating point arithmetic
 */
export class BiGraph {
  private size: number;
  private lval: number[];
  private rval: number[];
  private lvis: boolean[];
  private rvis: boolean[];
  // left -> right
  private lmatch: number[];
  // right -> left
  private rmatch: number[];
  private rslack: number[];
  constructor(private weights: number[][]) {
    this.size = weights.length;
    this.lval = new Array<number>(this.size);
    this.rval = new Array<number>(this.size);
    this.lvis = new Array<boolean>(this.size);
    this.rvis = new Array<boolean>(this.size);
    this.lmatch = new Array<number>(this.size);
    this.rmatch = new Array<number>(this.size);
    this.rslack = new Array<number>(this.size);
  }

  /** Get match of a node, `wIsLeft` denotes `w` is a left or right node,
   * and return its right match if w is a left node, and vice verser
    */
  getMatch(w: number, wIsLeft = true): number {
    if (wIsLeft) {
      return this.lmatch[w];
    } else {
      return this.rmatch[w];
    }
  }

  /** Match the bipart graph using KM algorithm, see also
   * https://blog.csdn.net/weixin_43093481/article/details/84558029
   * http://www.renfei.org/blog/bipartite-matching.html
   * https://oi-wiki.org/topic/graph-matching/bigraph-weight-match/
   */
  match(): number {
    this.lmatch.fill(-1);
    this.rmatch.fill(-1);
    this.rval.fill(0);
    for (let v = 0; v < this.size; v ++) {
      this.lval[v] = Math.max(...this.weights[v]);
    }
    for (let v = 0; v < this.size; v ++) {
      this.rslack.fill(Number.POSITIVE_INFINITY);
      while (true) { // eslint-disable-line
        this.lvis.fill(false);
        this.rvis.fill(false);
        if (this.tryDfsAndFound(v)) { break; }
        let d = Number.POSITIVE_INFINITY;
        for (let w = 0; w < this.size; w ++) {
          if (!this.rvis[w]) {
            d = Math.min(this.rslack[w], d);
          }
        }
        for (let x = 0; x < this.size; x ++) {
          if (this.lvis[x]) {
            this.lval[x] -= d;
          }
          if (this.rvis[x]) {
            this.rval[x] += d;
          } else {
            this.rslack[x] -= d;
          }
        }
      }
    }
    return this.lmatch.reduce((cur, w, v) => cur + this.weights[v][w], 0);
  }

  private tryDfsAndFound(v: number) {
    this.lvis[v] = true;
    for (let w = 0; w < this.size; w ++) {
      if (this.rvis[w]) {
        continue;
      }
      const rest = this.lval[v] + this.rval[w] - this.weights[v][w];
      if (rest == 0) {
        this.rvis[w] = true;
        if (this.rmatch[w] == -1 || this.tryDfsAndFound(this.rmatch[w])) {
          this.rmatch[w] = v;
          this.lmatch[v] = w;
          return true;
        }
      } else {
        this.rslack[w] = Math.min(this.rslack[w], rest);
      }
    }
    return false;
  }
}

if (import.meta.main) {
  const left = ['A', 'B', 'C'];
  const right = ['a', 'b', 'c'];
  const weight = [
    [15, 12, 8],
    [14, 6, 8],
    [13, 12, 10]
  ];
  const g = new BiGraph(weight);
  console.log(g.match());
  for (let w = 0; w < 3; w ++) {
    console.log(`${left[g.getMatch(w)]} -> ${right[w]}: ${weight[g.getMatch(w)][w]}`);
  }
}