export default class KnaryTree<T> {
  // children count
  private _nc = 0; 
  // sibling cound
  private _ns = 0;
  // parent
  private _parent: KnaryTree<T> | null = null;
  // left children
  private _left: KnaryTree<T> | null = null;
  // right siblings
  private _right: KnaryTree<T> | null = null;
  // value of this node
  constructor(public value: T) {}

  get parent(): KnaryTree<T> | null {
    return this._parent;
  }

  get childrenCount(): number {
    return this._nc;
  }

  get siblingCount(): number {
    return this._ns;
  }

  addChild(x: T): void {
    this.addChildTree(new KnaryTree<T>(x));
  }

  addChildTree(n: KnaryTree<T>): void {
    if (!this._left) {
      this._left = n;
    } else {
      /* eslint-disable */
      let curr = this._left!;
      while (curr._right != null) {
        curr = curr._right;
      }
      curr._right = n;
    }
    this._nc += 1;
    n._parent = this;
  }

  addSibling(x: T): void {
    this.addSiblingTree(new KnaryTree<T>(x));
  }

  addSiblingTree(n: KnaryTree<T>): void {
    if (!this._right) {
      this._right = n;
    } else {
      /* eslint-disable */
      let curr = this._right!;
      while (curr._right != null) {
        curr = curr._right;
      }
      curr._right = n;
    }
    this._ns += 1;
    n._parent = this._parent;
  }

  *children(): IterableIterator<KnaryTree<T>> {
    let curr = this._left;
    while (curr != null) {
      yield curr;
      curr = curr._right;
    }
  }

  *siblings(): IterableIterator<KnaryTree<T>> {
    let curr = this._right;
    while (curr != null) {
      yield curr;
      curr = curr._right;
    }
  }

  async accept(visitor: (n: KnaryTree<T>) => void): Promise<void> {
    await visitor(this);
    for (const c of this.children()) {
      await c.accept(visitor);
    }
  }
}