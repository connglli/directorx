import { DxSegment } from './ui_seg.ts';
import DxView from '../dxview.ts';
import { BiGraph } from '../utils/bigraph.ts';
import * as vecutil from '../utils/vecutil.ts';
import * as strutil  from '../utils/strutil.ts';

export const NO_MATCH: DxSegment = {
  roots: [], x: -1, y: -1, w: -1, h: -1, level: -1, parent: null,
};
export type DxSegMatch = [DxSegment, DxSegment, number][];

type WordFreq = {
  // word -> frequency
  [word: string]: number;
}

/** Collect the words and create a WordFreq from a segment */
function newWordFreq(seg: DxSegment): WordFreq {
  const vec: WordFreq = {};
  function collect(view: DxView) {
    const ws = [
      ...strutil.words(view.resEntry).map(w => w.toLowerCase()),
      ...strutil.words(view.desc).map(w => w.toLowerCase()),
      ...strutil.words(view.text).map(w => w.toLowerCase()),
      ...strutil.words(view.tag).map(w => w.toLowerCase()),
      ...strutil.words(view.tip).map(w => w.toLowerCase()),
      ...strutil.words(view.hint).map(w => w.toLowerCase())
    ];
    for (const w of ws) {
      vec[w] = 1 + (vec[w] ?? 0);
    }
    for (const c of view.children) {
      collect(c);
    }
  }
  for (const r of seg.roots) {
    collect(r);
  }
  return vec;
}

type WordVector = {
  words: string[];
  vector: number[];
};

/** Create a WordVector from a WordFreq and a set of words */
function newWordVector(
  wf: WordFreq, 
  words = Object.keys(wf)
): WordVector {
  return {
    words: words.slice(),
    vector: words.map(w => wf[w] ?? 0)
  };
}

/** Calculator similarity of two word vectors (cosine similarity) */
function similarity(v1: WordVector, v2: WordVector): number {
  const sc = 1000;
  const dt = vecutil.dot(v1.vector, v2.vector);
  const n1 = vecutil.norm(v1.vector);
  const n2 = vecutil.norm(v2.vector);
  return Math.round(sc * dt / (n1 * n2));
}

export function matchSeg(a: DxSegment[], b: DxSegment[]): DxSegMatch {
  const left = a.slice();
  const right = b.slice();
  const diff = left.length - right.length;
  if (diff > 0) {
    for (let i = 0; i < diff; i ++) {
      right.push(NO_MATCH);
    }
  } else if (diff < 0) {
    for (let i = 0; i < -diff; i ++) {
      left.push(NO_MATCH);
    }
  }
  const size = left.length;
  
  // create word frequency
  const leftWfs = left.map(s => newWordFreq(s));
  const rightWfs = right.map(s => newWordFreq(s));
  // collect all words
  const words = Array.from(new Set([...leftWfs, ...rightWfs].flatMap(f => Object.keys(f))));
  // create word vector
  const leftWvs = leftWfs.map(wf => newWordVector(wf, words));
  const rightWvs = rightWfs.map(wf => newWordVector(wf, words));
  
  // similarity as weights, and make the similarity of 
  // NO_MATCH to any as 0
  const weights: number[][] = [];
  for (let v = 0; v < size; v ++) {
    if (left[v] == NO_MATCH) {
      weights.push(new Array<number>(size).fill(0));
    } else {
      const v1 = leftWvs[v];
      weights.push(rightWvs.map(
        (v2, w) => right[w] == NO_MATCH ? 0 : similarity(v1, v2)
      ));
    }
  }

  // do bipart graph maximum weight perfect matching
  // and get the matched segments
  const graph = new BiGraph(weights);
  graph.match();

  // construct and return the matched result 
  const mat: DxSegMatch = [];
  for (let v = 0; v < left.length; v ++) {
    const w = graph.getMatch(v, true);
    mat.push([left[v], right[w], weights[v][w]]);
  }
  
  return mat;
}