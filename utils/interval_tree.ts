import Interval, { XYInterval } from './interval.ts';

/** Nullable type, for ease of use */
type N<T> = T | null;
/** Shortcut for infinity interval */
const INF_INV = Interval.INF;
const XY_INF_INV = XYInterval.INF;

export class IntervalTreeError extends Error {}

/** An IntervalData is a pair of an Interval and T */
export type IntervalData<T> = [Interval, T];
/** An ElementIntervalData is a pair of an Interval and T[] */
export type ElementIntervalData<T> = [Interval, T[]];

/** An IntervalWrapper wraps an Interval with
 * extra data, i.e., the overlapped. And all
 * IntervalWrappers form a double linked-list
 * from left to right in the IntervalTree
 */
class IntervalWrapper<T> {
  public readonly inv: Interval;
  public readonly data: T[] = [];
  public prev: N<IntervalWrapper<T>> = null;
  public next: N<IntervalWrapper<T>> = null;

  constructor(low: number, high: number) {
    this.inv = Interval.of(low, high);
  }

  get low(): number {
    return this.inv.low;
  }

  get high(): number {
    return this.inv.high;
  }
}

/** A Node is a tree node, which includes a left
 * child, a right child, and its corresponding
 * left and right intervals
 */
class IntervalTreeNode<T> {
  public parent: N<IntervalTreeNode<T>> = null;
  public left: N<IntervalTreeNode<T>> = null;
  public right: N<IntervalTreeNode<T>> = null;
  public readonly inv: {
    left: IntervalWrapper<T>;
    right: IntervalWrapper<T>;
  };

  constructor(center: number, low: number, high: number) {
    this.inv = {
      left: new IntervalWrapper<T>(low, center),
      right: new IntervalWrapper<T>(center, high),
    };
    this.inv.left.next = this.inv.right;
    this.inv.right.prev = this.inv.left;
  }

  get center(): number {
    return this.inv.left.high;
  }

  get low(): number {
    return this.inv.left.low;
  }

  get high(): number {
    return this.inv.right.high;
  }
}

/** An IntervalTree is a binary search tree with extra
 * data, i.e., the left and right intervals. See also
 * http://www.dgp.toronto.edu/~jstewart/378notes/22intervals/
 */
export default class IntervalTree<T> {
  // Interval of the tree
  public readonly inv: Interval;
  // Root node of the BST
  private root: IntervalTreeNode<T>;
  // Head of the element interval
  private head: IntervalWrapper<T>;
  // Dict of the inserted data->interval pair
  private readonly dict: Map<T, Interval>;

  constructor(inv: Interval = INF_INV) {
    this.inv = inv;
    this.dict = new Map<T, Interval>();
    this.root = new IntervalTreeNode<T>(inv.low, INF_INV.low, inv.high);
    this.root.right = new IntervalTreeNode<T>(inv.high, inv.low, INF_INV.high);
    this.root.inv.right = this.root.right.inv.left;
    this.root.inv.left.next = this.root.inv.right;
    this.root.inv.right.prev = this.root.inv.left;
    this.head = this.root.inv.left;
  }

  /** Query all data that overlap with inv */
  query(inv: Interval): IntervalData<T>[] {
    const res: IntervalData<T>[] = [];
    const set = new Set<T>();
    const lmi = this.findInterval(this.root, inv.low);
    if (inv.low == inv.high) {
      for (const data of lmi.data) {
        set.add(data);
      }
    } else {
      const rmi = this.findInterval(this.root, inv.high);
      for (
        let i: N<IntervalWrapper<T>> = lmi;
        i && i.next != rmi.next;
        i = i.next
      ) {
        for (const data of i.data) {
          set.add(data);
        }
      }
    }
    for (const data of set) {
      res.push([this.dict.get(data)!, data]); // eslint-disable-line
    }
    return res;
  }

  /** Return all element intervals and its overlapping data */
  elements(): ElementIntervalData<T>[] {
    // the element intervals right from the left most node's left interval
    const result: ElementIntervalData<T>[] = [];
    for (
      let inv: N<IntervalWrapper<T>> = this.head.next;
      inv && inv.next;
      inv = inv.next
    ) {
      result.push([inv.inv, inv.data]);
    }
    return result;
  }

  /** Insert an interval with data to the tree */
  insert(inv: Interval, data: T): void {
    if (this.dict.has(data)) {
      throw new IntervalTreeError(`data ${data} already added to the tree`);
    }
    // insert interval firstly
    const [lmn, rmn] = this.insertInterval(inv);
    // then add data to all overlapped intervals
    for (
      let i: N<IntervalWrapper<T>> = lmn.inv.right;
      i && i != rmn.inv.right;
      i = i.next
    ) {
      i.data.push(data);
    }
    // add data to reverse dict finally
    this.dict.set(data, inv);
  }

  private insertInterval(
    inv: Interval
  ): [IntervalTreeNode<T>, IntervalTreeNode<T>] {
    if (Interval.cover(this.inv, inv) < 0) {
      throw new IntervalTreeError(
        'Interval to insert out of the tree interval'
      );
    }
    // insert l as a center
    const leftMostNode = this.insertNode(this.root, inv.low);
    // insert r as a center
    const rightMostNode = this.insertNode(this.root, inv.high);
    return [leftMostNode, rightMostNode];
  }

  private insertNode(
    node: IntervalTreeNode<T>,
    center: number
  ): IntervalTreeNode<T> {
    if (center == node.center) {
      return node;
    } else if (center < node.center) {
      if (node.left == null) {
        const left = new IntervalTreeNode<T>(center, node.low, node.center);
        this.setLeftChild(node, left);
        return left;
      } else {
        return this.insertNode(node.left, center);
      }
    } else {
      if (node.right == null) {
        const right = new IntervalTreeNode<T>(center, node.center, node.high);
        this.setRightChild(node, right);
        return right;
      } else {
        return this.insertNode(node.right, center);
      }
    }
  }

  private findInterval(
    node: IntervalTreeNode<T>,
    x: number
  ): IntervalWrapper<T> {
    if (x == node.center) {
      return node.inv.right;
    } else if (x < node.center) {
      if (node.left) {
        return this.findInterval(node.left, x);
      } else {
        return node.inv.left;
      }
    } else {
      if (node.right) {
        return this.findInterval(node.right, x);
      } else {
        return node.inv.right;
      }
    }
  }

  private findNode(
    node: IntervalTreeNode<T>,
    center: number
  ): N<IntervalTreeNode<T>> {
    if (center == node.center) {
      return node;
    } else if (center < node.center) {
      if (node.left) {
        return this.findNode(node.left, center);
      } else {
        return null;
      }
    } else {
      if (node.right) {
        return this.findNode(node.right, center);
      } else {
        return null;
      }
    }
  }

  private setLeftChild(node: IntervalTreeNode<T>, left: IntervalTreeNode<T>) {
    node.left = left;
    left.parent = node;
    // new left child's intervals inherits all
    // data from old left interval, thus push
    // them to new left node's intervals
    for (const d of node.inv.left.data) {
      left.inv.left.data.push(d);
      left.inv.right.data.push(d);
    }
    // connect new left child's interval to old
    // left interval's prev and next
    left.inv.left.prev = node.inv.left.prev;
    if (node.inv.left.prev != null) {
      node.inv.left.prev.next = left.inv.left;
    }
    left.inv.right.next = node.inv.right;
    node.inv.right.prev = left.inv.right;
    // reset current left interval to the new
    // left child's right interval
    node.inv.left = left.inv.right;
    // reset left neighbor's right interval
    const neighbor = this.findNode(this.root, left.low);
    if (neighbor) {
      neighbor.inv.right = left.inv.left;
    }
  }

  private setRightChild(node: IntervalTreeNode<T>, right: IntervalTreeNode<T>) {
    node.right = right;
    right.parent = node;
    // new right child's intervals inherits all
    // data from old right interval, thus push
    // them to new right node's intervals
    for (const d of node.inv.right.data) {
      right.inv.left.data.push(d);
      right.inv.right.data.push(d);
    }
    // connect new right child's interval to old
    // right interval's prev and next
    right.inv.right.next = node.inv.right.next;
    if (node.inv.right.next) {
      node.inv.right.next.prev = right.inv.right;
    }
    right.inv.left.prev = node.inv.left;
    node.inv.left.next = right.inv.left;
    // reset current right interval to the new
    // right child's left interval
    node.inv.right = right.inv.left;
    // reset left neighbor's right interval
    const neighbor = this.findNode(this.root, right.high);
    if (neighbor) {
      neighbor.inv.left = right.inv.right;
    }
  }
}

export type XYIntervalData<T> = [XYInterval, T];

export class XYIntervalTree<T> {
  private xTree: IntervalTree<T>;
  private yTree: IntervalTree<T>;
  constructor(public readonly inv: XYInterval = XY_INF_INV) {
    this.xTree = new IntervalTree(inv.x);
    this.yTree = new IntervalTree(inv.y);
  }

  insert(inv: XYInterval, data: T): void {
    this.xTree.insert(inv.x, data);
    this.yTree.insert(inv.y, data);
  }

  query(inv: XYInterval): XYIntervalData<T>[] {
    const x = this.xTree.query(inv.x);
    const y = this.yTree.query(inv.y);
    const yd = y.map(([, d]) => d);
    const res: XYIntervalData<T>[] = [];
    // overlap iff x- and y-overlap
    for (let xi = 0; xi < x.length; xi++) {
      const [xinv, d] = x[xi];
      const yi = yd.indexOf(d);
      if (yi != -1) {
        const [yinv] = y[yi];
        res.push([XYInterval.of(xinv.low, xinv.high, yinv.low, yinv.high), d]);
      }
    }
    return res;
  }
}

if (import.meta.main) {
  const t = new IntervalTree<string>(Interval.of(0, 30));
  t.insert(Interval.of(10, 20), 'x');
  console.log('Inserted [10, 20]');
  t.insert(Interval.of(15, 25), 'y');
  console.log('Inserted [15, 25]');
  t.insert(Interval.of(18, 22), 'z');
  console.log('Inserted [18, 22]');
  t.insert(Interval.of(15, 25), 't');
  console.log('Inserted [15, 25]');
  t.insert(Interval.of(0, 30), 'o');
  console.log('Inserted [0, 30]');
  t.insert(Interval.of(0, 12), '1');
  console.log('Inserted [0, 12]');
  for (const [v, data] of t.elements()) {
    console.log(`[${v.low}, ${v.high}] (${data})`);
  }
  console.log('Query [10, 23]');
  for (const [v, data] of t.query(Interval.of(10, 23))) {
    console.log(`[${v.low}, ${v.high}] (${data})`);
  }
  console.log('Query [26, 30]');
  for (const [v, data] of t.query(Interval.of(26, 30))) {
    console.log(`[${v.low}, ${v.high}] (${data})`);
  }
  console.log('Query [-10, 10]');
  for (const [v, data] of t.query(Interval.of(-10, 10))) {
    console.log(`[${v.low}, ${v.high}] (${data})`);
  }
  console.log('Query [-10, 0]');
  for (const [v, data] of t.query(Interval.of(-10, 0))) {
    console.log(`[${v.low}, ${v.high}] (${data})`);
  }
  console.log('Query [30, 190]');
  for (const [v, data] of t.query(Interval.of(30, 190))) {
    console.log(`[${v.low}, ${v.high}] (${data})`);
  }
  console.log('Query [13, 13]');
  for (const [v, data] of t.query(Interval.of(13, 13))) {
    console.log(`[${v.low}, ${v.high}] (${data})`);
  }
  console.log('Query [20, 20]');
  for (const [v, data] of t.query(Interval.of(20, 20))) {
    console.log(`[${v.low}, ${v.high}] (${data})`);
  }
  console.log('Query [50, 50]');
  for (const [v, data] of t.query(Interval.of(50, 50))) {
    console.log(`[${v.low}, ${v.high}] (${data})`);
  }
}
