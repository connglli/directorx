export default class KnaryTree<T> {
  // left children
  private _left: KnaryTree<T> | null = null;
  // right siblings
  private _right: KnaryTree<T> | null = null;
  // value of this node
  constructor(public value: T) {}

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
  }

  *children(): Iterator<KnaryTree<T>> {
    let curr = this._left;
    while (curr != null) {
      yield curr;
      curr = curr._right;
    }
  }

  *siblings(): Iterator<KnaryTree<T>> {
    let curr = this._right;
    while (curr != null) {
      yield curr;
      curr = curr._right;
    }
  }
}