import DxSegment from '../ui/dxseg.ts';
import { enumerate } from '../utils/pyalike.ts';

/** If a segment is matched to nobody, then it is matched to NO_MATCH */
export const NO_MATCH: DxSegment = new DxSegment([], -1, -1, -1, -1, -1);

/** Two matched segments and their match score */
export type MatchItem = [DxSegment, DxSegment, number];

/** DxSegmentMatch is the match result of two segments, one can
 * fetch the global best match of a segment by #getMatch() */
export class DxSegMatch {
  constructor(
    private left: DxSegment[],
    private right: DxSegment[],
    private score: number[][],
    // indices of matched segments
    private match: [number, number][]
  ) {}

  /** Get the perfect matched segment, i.e., the most satisfying
   * matched segment (not strictly the best match whose score is
   * the best) */
  getPerfectMatch(s: DxSegment): DxSegment | null {
    for (const [a, b] of this.match) {
      if (this.left[a] == s) {
        return this.right[b];
      } else if (this.right[b] == s) {
        return this.left[a];
      }
    }
    return null;
  }

  /** Get the matches whose score is the best, returning
   * the score, and the matched segments */
  getBestMatches(s: DxSegment): [number, DxSegment[]] {
    let ind = this.left.indexOf(s);
    if (ind == -1) {
      ind = this.right.indexOf(s);
      if (ind == -1) {
        return [Number.NEGATIVE_INFINITY, []];
      } else {
        return this.doGetBestMatch(ind, false);
      }
    } else {
      return this.doGetBestMatch(ind, true);
    }
  }

  /** Iterates over the most satisfying matches */
  *[Symbol.iterator](): IterableIterator<MatchItem> {
    yield* this.match.map(
      ([a, b]) => [this.left[a], this.right[b], this.score[a][b]] as MatchItem
    );
  }

  private doGetBestMatch(
    ind: number,
    indIsLeft: boolean
  ): [number, DxSegment[]] {
    let sco: number[];
    if (indIsLeft) {
      sco = this.score[ind];
    } else {
      sco = this.score.map((i) => i[ind]);
    }
    let maxInd: number[] = [];
    let maxSco = Number.NEGATIVE_INFINITY;
    for (const [i, w] of enumerate(sco)) {
      if (w > maxSco) {
        maxInd = [i];
        maxSco = w;
      } else if (w == maxSco) {
        maxInd.push(i);
      }
    }
    return [
      maxSco,
      maxInd.map((i) => (indIsLeft ? this.right[i] : this.left[i])),
    ];
  }
}

/** A segment matcher matches two groups of segments, and returns
 * a matching result, from which one can fetch the perfect and best
 * matches */
export default interface DxSegmentMatcher {
  match(a: DxSegment[], b: DxSegment[]): Promise<DxSegMatch>;
}
