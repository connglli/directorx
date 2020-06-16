import DxEvent, { 
  DxTapEvent,
  DxLongTapEvent,
  DxDoubleTapEvent,
  DxSwipeEvent, 
  DxKeyEvent
} from './dxevent.ts';
import DxLog from './dxlog.ts';
import DxView, { 
  DefaultFlags, 
  DxViewVisibility, 
  DxActivity 
} from './dxview.ts';
import LinkedList from './utils/linked_list.ts';
import KnaryTree from './utils/knary_tree.ts';

class ViewCache {
  private cache: LinkedList<DxView> = new LinkedList<DxView>();

  get(): DxView {
    if (this.cache.isEmpty()) {
      return new DxView('', DefaultFlags, 0, 0, 0, 0);
    }
    return this.cache.remove(0);
  }

  put(v: DxView): void {
    this.cache.push_front(v);
  }
}

class ActivityPack extends DxActivity {
  constructor(
    pkg: string,
    name: string,
    public readonly indTree: KnaryTree<number>
  ) {
    super(pkg, name);
  }

  build(): DxActivity | null {
    throw 'Not implemented by far';
  }
}

class EventPack {
  constructor(public readonly e: DxEvent, public readonly a: ActivityPack) {}

  ap(): ActivityPack {
    return this.a as ActivityPack;
  }

  build(): DxEvent | null {
    throw 'Not implemented by far';
  }
}

export class DxPacker {
  // cache unused views
  private readonly cache: ViewCache = new ViewCache();

  // view pool: save all views used in a pool:
  // views that are same are saved only 1 copy
  private readonly vPool: DxView[] = [];
  // event sequence
  private readonly evSeq: EventPack[] = [];
  
  constructor(
    private readonly app: string,
  ) {}

  append(e: DxEvent): void {
    this.infoLog(e);
    /* eslint-disable */
    const ap = this.pack(e.a);
    let ne: DxEvent;
    switch (e.ty) {
    case 'tap':
      ne = new DxTapEvent(
        ap,
        (e as DxTapEvent).x,
        (e as DxTapEvent).y,
        (e as DxTapEvent).t
      );
      break;
    
    case 'double-tap':
      ne = new DxDoubleTapEvent(
        ap,
        (e as DxDoubleTapEvent).x,
        (e as DxDoubleTapEvent).y,
        (e as DxDoubleTapEvent).t
      );
      break;

    case 'long-tap':
      ne = new DxLongTapEvent(
        ap,
        (e as DxLongTapEvent).x,
        (e as DxLongTapEvent).y,
        (e as DxLongTapEvent).t
      );
      break;

    case 'swipe':
      ne = new DxSwipeEvent(
        ap,
        (e as DxSwipeEvent).x,
        (e as DxSwipeEvent).y,
        (e as DxSwipeEvent).dx,
        (e as DxSwipeEvent).dy,
        (e as DxSwipeEvent).t0,
        (e as DxSwipeEvent).t1
      );
      break;
  
    case 'key':
      ne = new DxKeyEvent(
        ap,
        (e as DxKeyEvent).c,
        (e as DxKeyEvent).k,
        (e as DxKeyEvent).t
      );
      break;
    }
    this.evSeq.push(new EventPack(ne, ap));
  }

  newView(): DxView {
    return this.cache.get();
  }

  async save(path: string): Promise<void> {
    // TODO save in a binary compressed format
    const encoder = new TextEncoder();
    await Deno.writeFile(
      path,
      encoder.encode(JSON.stringify(
        {
          app: this.app,
          pool: this.vPool,
          seq: this.evSeq,
        },
        null,
        2,
      )),
    );
  }

  static async load(dxpk: string): Promise<DxPacker> {
    throw 'Not implemented by far';
  }

  private pack(a: DxActivity): ActivityPack {
    const { pkg, name, decorView } = a;
    const tree = this.packInner(decorView!); // eslint-disable-line
    const pack = new ActivityPack(pkg, name, tree);
    return pack;
  }

  private packInner(v: DxView): KnaryTree<number> {
    v.detach();
    let ind = -1;
    for (const i in this.vPool) {
      if (this.viewEq(v, this.vPool[i])) {
        ind = Number(i);
        break;
      }
    }
    if (ind == -1) {
      ind = this.vPool.length;
      this.vPool.push(v);
    } else {
      this.cache.put(v);
    }
    const node = new KnaryTree<number>(ind);
    for (const c of v.children.slice(0)) {
      node.addChildTree(this.packInner(c));
    }
    return node;
  }

  private viewEq(a: DxView, b: DxView) {
    return (
      a.cls == b.cls &&
      a.left == b.left &&
      a.right == b.right &&
      a.top == b.top &&
      a.bottom == b.bottom &&
      a.res == b.res &&
      a.desc == b.desc &&
      a.text == b.text &&
      a.flags.v == b.flags.v &&
      a.flags.f == b.flags.f &&
      a.flags.e == b.flags.e &&
      a.flags.d == b.flags.d &&
      a.flags.hs == b.flags.hs &&
      a.flags.vs == b.flags.vs &&
      a.flags.c == b.flags.c &&
      a.flags.lc == b.flags.lc &&
      a.flags.cc == b.flags.cc
    );
  }

  private findHitViews(v: DxView, x: number, y: number): DxView[] {
    if (!this.hitView(v, x, y)) {
      return [];
    }
    let hits: DxView[] = [v];
    for (const c of v.children) {
      hits = [...this.findHitViews(c, x, y), ...hits];
    }
    return hits;
  }

  private hitView(v: DxView, x: number, y: number): boolean {
    const { flags, left, right, top, bottom } = v;
    return (
      flags.v == DxViewVisibility.VISIBLE && 
      left <= x && x <= right && 
      top <= y && y <= bottom
    );
  }

  private infoLog(e: DxEvent) {
    switch (e.ty) {
    case 'tap':
      this.infoLogInner(
        e,
        this.findHitViews(
          e.a.decorView!,
          (e as DxTapEvent).x,
          (e as DxTapEvent).y
        )
      );
      break;
    
    case 'double-tap':
      this.infoLogInner(
        e,
        this.findHitViews(
          e.a.decorView!,
          (e as DxDoubleTapEvent).x,
          (e as DxDoubleTapEvent).y
        )
      );
      break;

    case 'long-tap':
      this.infoLogInner(
        e,
        this.findHitViews(
          e.a.decorView!,
          (e as DxLongTapEvent).x,
          (e as DxLongTapEvent).y
        )
      );
      break;

    case 'swipe':
      this.infoLogInner(
        e,
        this.findHitViews(
          e.a.decorView!,
          (e as DxSwipeEvent).x,
          (e as DxSwipeEvent).y
        )
      );
      break;
  
    case 'key':
      this.infoLogInner(e, []);
      break;
    }
  }

  private infoLogInner(e: DxEvent, views: DxView[]) {
    if (views.length != 0) {
      const v = views[0];
      DxLog.debug(`${e.ty} cls=${v.cls} text="${v.text}" desc="${v.desc}"`);
    } else if (e.ty == 'key') {
      DxLog.debug(`${e.ty} ${(e as DxKeyEvent).k}`);
    }
  }
}
