/** ArrayTreeNode is a knary tree node whose children returned is an array.
 * This class is expected to be used via recursive generic, i.e., if a class
 * ExampleTreeNode would like use this class, use it by
 *     class ExampleTreeNode implements ArrayTreeNode<ExampleTreeNode>
 * Any classes extending ArrayTreeNode<T> can use ArrayTreeOp.
 * */
export interface ArrayTreeNode<T> {
  parent: (ArrayTreeNode<T> & T) | null;
  children: (ArrayTreeNode<T> & T)[];
}

type N<T> = T | null;
type Node<T> = ArrayTreeNode<T> & T;

export type TreeWalkerListenerFn<T> = (n: T) => void;

export interface TreeWalkerListener<T> {
  onWalk: TreeWalkerListenerFn<T>;
}

export default class ArrayTreeOp {
  /** Dfs walk the tree, and trigger the listener */
  static walk<T>(
    n: Node<T>,
    walker: TreeWalkerListener<T> | TreeWalkerListenerFn<T>
  ) {
    if (typeof walker == 'function') {
      walker(n);
    } else {
      walker.onWalk(n);
    }
    for (const cn of n.children) {
      ArrayTreeOp.walk(cn, walker);
    }
  }

  /** Find all Node<T>s that satisfy the predicate */
  static find<T>(n: Node<T>, pred: (n: T) => boolean): T[] {
    let found: T[] = [];
    ArrayTreeOp.walk(n, (m) => {
      if (pred(m)) {
        found.push(m);
      }
    });
    return found;
  }

  /** Find the first Node<T> via dfs that satisfy the predicate */
  static findFirst<T>(n: Node<T>, pred: (n: T) => boolean): N<T> {
    let found: N<T> = null;
    ArrayTreeOp.walk(n, (m) => {
      if (!found && pred(m)) {
        found = m;
      }
    });
    return found;
  }

  /** Walk the hierarchy up to find all parents that satisfy the predicate */
  static findParents<T>(n: Node<T>, pred: (n: T) => boolean): T[] {
    let found: T[] = [];
    let p = n.parent;
    while (p != null) {
      if (pred(p)) {
        found.push(p);
      }
      p = p.parent;
    }
    return found;
  }

  /** Walk the hierarchy up to find the first parent that satisfy the predicate */
  static findParent<T>(n: Node<T>, pred: (n: T) => boolean): N<T> {
    let p = n.parent;
    while (p != null) {
      if (pred(p)) {
        return p;
      }
      p = p.parent;
    }
    return null;
  }

  /** Find the Node<T>s by children indices */
  static findChildByIndices<T>(n: Node<T>, indices: number[]): N<T> {
    let p: Node<T> = n;
    for (let i = 0; i < indices.length; i++) {
      const ind = indices[i];
      if (ind < 0 || ind >= p.children.length) {
        return null;
      }
      p = p.children[ind];
    }
    return p;
  }
}
