import { readLines } from './base/deps.ts';
import DxEvent, {
  DxTapEvent,
  DxLongTapEvent,
  DxDoubleTapEvent,
  DxSwipeEvent,
  DxKeyEvent,
  DxTextEvent,
  DxHideSoftKeyboardEvent,
} from './dxevent.ts';
import DxLog from './dxlog.ts';
import DxView, {
  DxDecorView,
  DxViewPager,
  DxTabHost,
  ViewFactory,
  ViewType,
  ViewFinder,
  ViewProps,
} from './ui/dxview.ts';
import DxCompatUi, { FragmentManager, DxFragment } from './ui/dxui.ts';
import { DevInfo } from './dxadb.ts';
import * as base64 from './utils/base64.ts';
import KnaryTree from './utils/knary_tree.ts';
import { IllegalStateError, CannotReachHereError } from './utils/error.ts';

class CompatUiPack extends DxCompatUi {
  constructor(
    app: string,
    name: string,
    public readonly vTree: KnaryTree<number>,
    public readonly fInd: number[] // TODO: change to fTree, because it each fragment is also an owner
  ) {
    super(app, name);
  }
}

class EventPack {
  constructor(public readonly e: DxEvent, public readonly up: CompatUiPack) {}
}

type DxpkFields = {
  app: string;
  dev: DevInfo;
  vpool: DxView[];
  fpool: DxFragment[];
  eseq: EventPack[];
};

class DXPK {
  private static readonly ENCODER = new TextEncoder();
  private static readonly DECODER = new TextDecoder();

  private static readonly STATE_DEV = 0; // read dev info next
  private static readonly STATE_APP = 1; // read app next
  private static readonly STATE_PSZ = 2; // read view pool size next
  private static readonly STATE_POL = 3; // read view pool item (view) next
  private static readonly STATE_FPS = 4; // read fragment pool size next
  private static readonly STATE_FPL = 5; // read fragment pool item (fragment) next
  private static readonly STATE_SSZ = 6; // read seq_size next
  private static readonly STATE_SEQ = 7; // read seq item (event) next
  private static readonly STATE_DNE = 8; // no long read

  private static type2str(t: ViewType): string {
    switch (t) {
      case ViewType.DECOR_VIEW:
        return 'd';
      case ViewType.VIEW_PAGER:
        return 'p';
      case ViewType.TAB_HOST:
        return 't';
      case ViewType.WEB_VIEW:
        return 'w';
      case ViewType.LIST_VIEW:
        return 'l';
      case ViewType.RECYCLER_VIEW:
        return 'r';
      case ViewType.GRID_VIEW:
        return 'g';
      case ViewType.SCROLL_VIEW:
        return 's';
      case ViewType.HORIZONTAL_SCROLL_VIEW:
        return 'h';
      case ViewType.NESTED_SCROLL_VIEW:
        return 'n';
      case ViewType.TOOLBAR:
        return 'b';
      case ViewType.VIEW:
        return '.';
      default:
        throw new CannotReachHereError();
    }
  }

  private static str2type(s: string): ViewType {
    switch (s) {
      case 'd':
        return ViewType.DECOR_VIEW;
      case 'p':
        return ViewType.VIEW_PAGER;
      case 't':
        return ViewType.TAB_HOST;
      case 'w':
        return ViewType.WEB_VIEW;
      case 'l':
        return ViewType.LIST_VIEW;
      case 'r':
        return ViewType.RECYCLER_VIEW;
      case 'g':
        return ViewType.GRID_VIEW;
      case 's':
        return ViewType.SCROLL_VIEW;
      case 'h':
        return ViewType.HORIZONTAL_SCROLL_VIEW;
      case 'n':
        return ViewType.NESTED_SCROLL_VIEW;
      case 'b':
        return ViewType.TOOLBAR;
      case '.':
        return ViewType.VIEW;
      default:
        throw new CannotReachHereError();
    }
  }

  /** Parse an dxpk file and return */
  static async load(path: string): Promise<DxpkFields> {
    // TODO: throw meaningful exception and
    // add semantic checking
    const vpool: DxView[] = [];
    const fpool: DxFragment[] = [];
    const eseq: EventPack[] = [];
    let app = '';
    let dev: DevInfo | null = null;

    const dxpk = await Deno.open(path, { read: true });

    let state = DXPK.STATE_DEV;
    let size = 0;
    for await (const l of readLines(dxpk)) {
      if (state == DXPK.STATE_DEV) {
        const tokens = l.trim().split(';');
        dev = new DevInfo(
          tokens[3],
          tokens[0],
          tokens[1],
          tokens[2],
          Number(tokens[4]),
          Number(tokens[5]),
          Number(tokens[6]),
          Number(tokens[7]),
          Number(tokens[8])
        );
        state = DXPK.STATE_APP;
      } else if (state == DXPK.STATE_APP) {
        app = l.trim();
        state = DXPK.STATE_PSZ;
      } else if (state == DXPK.STATE_PSZ) {
        size = Number(l.trim());
        state = size != 0 ? DXPK.STATE_POL : DXPK.STATE_FPS;
      } else if (state == DXPK.STATE_POL) {
        const tokens = l.trim().split(';');
        const type = DXPK.str2type(tokens[0]);
        const props: ViewProps = {
          package: app,
          class: tokens[1],
          id: tokens[2],
          hash: tokens[3],
          flags: {
            V: tokens[26][0] as 'V' | 'I' | 'G',
            f: tokens[26][1] == 'F',
            F: tokens[26][2] == 'F',
            S: tokens[26][3] == 'S',
            E: tokens[26][4] == 'E',
            d: tokens[26][5] == 'D',
            s: {
              l: tokens[26][6] == 'L',
              t: tokens[26][7] == 'T',
              r: tokens[26][8] == 'R',
              b: tokens[26][9] == 'B',
            },
            c: tokens[26][10] == 'C',
            lc: tokens[26][11] == 'L',
            cc: tokens[26][12] == 'X',
            a: tokens[26][13] == 'A',
          },
          shown: tokens[7] == 'S' ? true : false,
          bgClass: tokens[23],
          bgColor: tokens[24] == '.' ? null : Number(tokens[24]),
          foreground: tokens[25] == '.' ? null : tokens[24],
          left: Number(tokens[8]),
          top: Number(tokens[9]),
          right: Number(tokens[10]),
          bottom: Number(tokens[11]),
          elevation: Number(tokens[12]),
          translationX: Number(tokens[13]),
          translationY: Number(tokens[14]),
          translationZ: Number(tokens[15]),
          scrollX: Number(tokens[16]),
          scrollY: Number(tokens[17]),
          resPkg: tokens[4],
          resType: tokens[5],
          resEntry: tokens[6],
          desc: base64.decode(tokens[18]),
          text: base64.decode(tokens[19]),
          tag: base64.decode(tokens[20]),
          tip: base64.decode(tokens[21]),
          hint: base64.decode(tokens[22]),
        };
        switch (type) {
          case ViewType.VIEW_PAGER:
            props.currItem = Number(tokens[27]);
            break;
          case ViewType.TAB_HOST:
            props.currTab = Number(tokens[27]);
            props.tabsHash = tokens[28];
            props.contentHash = tokens[29];
            break;
        }
        const view = ViewFactory.create(type, props);
        vpool.push(view);
        size -= 1;
        if (size == 0) {
          state = DXPK.STATE_FPS;
        }
      } else if (state == DXPK.STATE_FPS) {
        size = Number(l.trim());
        state = size != 0 ? DXPK.STATE_FPL : DXPK.STATE_SSZ;
      } else if (state == DXPK.STATE_FPL) {
        const tokens = l.trim().split(';');
        const fr = new DxFragment(
          {
            class: tokens[0],
            hash: tokens[1],
            containerId: tokens[2],
            fragmentId: tokens[3],
            hidden: tokens[4][1] == 'H',
            detached: tokens[4][2] == 'D',
          },
          tokens[4][0] == 'A'
        );
        fpool.push(fr);
        size -= 1;
        if (size == 0) {
          state = DXPK.STATE_SSZ;
        }
      } else if (state == DXPK.STATE_SSZ) {
        size = Number(l.trim());
        state = size != 0 ? DXPK.STATE_SEQ : DXPK.STATE_DNE;
      } else if (state == DXPK.STATE_SEQ) {
        const tokens = l.trim().split(';');
        const app = tokens[0];
        const name = tokens[1];
        let [ind, nc] = tokens[2].split(',').map((t) => Number(t));
        const tree = new KnaryTree<number>(ind);
        const stack: number[] = [nc];
        let parent: KnaryTree<number> | null = tree;
        let i = 3;
        while (parent != null) {
          [ind, nc] = tokens[i].split(',').map((t) => Number(t));
          const curr = new KnaryTree<number>(ind);
          parent.addChildTree(curr);
          if (nc != 0) {
            parent = curr;
            stack.push(nc);
          } else {
            nc = stack.pop() as number;
            nc -= 1;
            while (nc == 0 && parent != null) {
              parent = parent.parent;
              nc = stack.pop() as number;
              nc -= 1;
            }
            if (nc != 0) {
              stack.push(nc);
            }
          }
          i += 1;
        }
        const indices: number[] = [];
        const count = Number(tokens[i]);
        i += 1;
        for (let j = 0; j < count; j++) {
          indices.push(Number(tokens[i + j]));
        }
        i += count == 0 ? 1 : count; // skip an empty ';' for count == 0
        const ap = new CompatUiPack(app, name, tree, indices);
        let e: DxEvent;
        switch (tokens[i]) {
          case 'tap':
            e = new DxTapEvent(
              ap,
              Number(tokens[i + 1]),
              Number(tokens[i + 2]),
              Number(tokens[i + 3])
            );
            break;
          case 'double-tap':
            e = new DxDoubleTapEvent(
              ap,
              Number(tokens[i + 1]),
              Number(tokens[i + 2]),
              Number(tokens[i + 3])
            );
            break;
          case 'long-tap':
            e = new DxLongTapEvent(
              ap,
              Number(tokens[i + 1]),
              Number(tokens[i + 2]),
              Number(tokens[i + 3])
            );
            break;
          case 'swipe':
            e = new DxSwipeEvent(
              ap,
              Number(tokens[i + 1]),
              Number(tokens[i + 2]),
              Number(tokens[i + 3]),
              Number(tokens[i + 4]),
              Number(tokens[i + 5]),
              Number(tokens[i + 6])
            );
            break;
          case 'key':
            e = new DxKeyEvent(
              ap,
              Number(tokens[i + 2]),
              tokens[i + 1],
              Number(tokens[i + 3])
            );
            break;
          case 'text':
            e = new DxTextEvent(
              ap,
              base64.decode(tokens[i + 1]),
              Number(tokens[i + 2])
            );
            break;
          case 'hsk':
            e = new DxHideSoftKeyboardEvent(ap, Number(tokens[i + 1]));
            break;
          default:
            throw new IllegalStateError(`Unsupported event type: ${tokens[i]}`);
        }
        eseq.push(new EventPack(e, ap));
        size -= 1;
        if (size == 0) {
          state = DXPK.STATE_DNE;
        }
      }
    }

    await dxpk.close();

    return { app, dev: dev!, vpool, fpool, eseq }; // eslint-disable-line
  }

  /** Dump dxpk to file
   *
   * File format:
   *      dev # brand;model;...
   *      app # pkg
   *      M # vpool_size
   *      v1 # cls;resType;...
   *      v2
   *      ...
   *      vM
   *      T # fpool_size
   *      f1 # cls;hash;...
   *      f2
   *      ...
   *      fT
   *      N # eseq_size
   *      e1 # tree;type;...
   *      e2
   *      ...
   *      eN
   */
  static async dump(path: string, dxpk: DxpkFields): Promise<void> {
    const buf = new Deno.Buffer();

    await DXPK.writeString(buf, `${dxpk.dev.brand};${dxpk.dev.model};`, false);
    await DXPK.writeString(buf, `${dxpk.dev.abi};${dxpk.dev.board};`, false);
    await DXPK.writeString(
      buf,
      `${dxpk.dev.width};${dxpk.dev.height};${dxpk.dev.dpi};`,
      false
    );
    await DXPK.writeString(buf, `${dxpk.dev.sdk};${dxpk.dev.release}`);
    await DXPK.writeString(buf, dxpk.app);
    await DXPK.writeNumber(buf, dxpk.vpool.length);
    for (const v of dxpk.vpool) {
      const type = ViewFactory.typeOf(v);
      await DXPK.writeString(
        buf,
        `${DXPK.type2str(type)};${v.cls};${v.id};${v.hash};`,
        false
      );
      await DXPK.writeString(
        buf,
        `${v.resPkg};${v.resType};${v.resEntry};${v.shown ? 'S' : '.'};`,
        false
      );
      await DXPK.writeString(
        buf,
        `${v.left};${v.top};${v.right};${v.bottom};${v.elevation};`,
        false
      );
      await DXPK.writeString(
        buf,
        `${v.translationX};${v.translationY};${v.translationZ};`,
        false
      );
      await DXPK.writeString(buf, `${v.scrollX};${v.scrollY};`, false);
      await DXPK.writeString(
        buf,
        `${base64.encode(v.desc)};${base64.encode(v.text)};`,
        false
      );
      await DXPK.writeString(
        buf,
        `${base64.encode(v.tag)};${base64.encode(v.tip)};${base64.encode(
          v.hint
        )};`,
        false
      );
      await DXPK.writeString(buf, `${v.bgClass};${v.bgColor ?? '.'};`, false);
      await DXPK.writeString(buf, `${v.foreground ?? '.'};`, false);
      let flags = '';
      flags += v.flags.V;
      flags += v.flags.f ? 'F' : '.';
      flags += v.flags.F ? 'F' : '.';
      flags += v.flags.S ? 'S' : '.';
      flags += v.flags.E ? 'E' : '.';
      flags += v.flags.d ? 'D' : '.';
      flags += v.flags.s.l ? 'L' : '.';
      flags += v.flags.s.t ? 'T' : '.';
      flags += v.flags.s.r ? 'R' : '.';
      flags += v.flags.s.b ? 'B' : '.';
      flags += v.flags.c ? 'C' : '.';
      flags += v.flags.lc ? 'L' : '.';
      flags += v.flags.cc ? 'X' : '.';
      flags += v.flags.a ? 'A' : '.';
      if (v instanceof DxViewPager) {
        await DXPK.writeString(buf, `${flags};`, false);
        await DXPK.writeString(buf, `${v.currPage}`);
      } else if (v instanceof DxTabHost) {
        await DXPK.writeString(buf, `${flags};`, false);
        await DXPK.writeString(
          buf,
          `${v.currTab};${v.tabsHash};${v.contentHash}`
        );
      } else {
        await DXPK.writeString(buf, flags);
      }
    }
    await DXPK.writeNumber(buf, dxpk.fpool.length);
    for (const f of dxpk.fpool) {
      await DXPK.writeString(
        buf,
        `${f.cls};${f.hash};${f.containerId};${f.fragmentId};`,
        false
      );
      let flags = '';
      flags += f.active ? 'A' : '.';
      flags += f.hidden ? 'H' : '.';
      flags += f.detached ? 'D' : '.';
      await DXPK.writeString(buf, flags);
    }
    await DXPK.writeNumber(buf, dxpk.eseq.length);
    for (const ep of dxpk.eseq) {
      await DXPK.writeString(buf, `${ep.up.app};${ep.up.name};`, false);
      await ep.up.vTree.accept(
        async (n: KnaryTree<number>): Promise<void> => {
          await DXPK.writeString(buf, `${n.value},${n.childrenCount};`, false);
        }
      );
      await DXPK.writeString(buf, `${ep.up.fInd.length};`, false);
      await DXPK.writeString(buf, `${ep.up.fInd.join(';')};`, false);
      await DXPK.writeString(buf, ep.e.ty + ';', false);
      if (ep.e.ty == 'tap') {
        const e = ep.e as DxTapEvent;
        await DXPK.writeString(buf, `${e.x};${e.y};${e.t}`);
      } else if (ep.e.ty == 'double-tap') {
        const e = ep.e as DxDoubleTapEvent;
        await DXPK.writeString(buf, `${e.x};${e.y};${e.t}`);
      } else if (ep.e.ty == 'long-tap') {
        const e = ep.e as DxLongTapEvent;
        await DXPK.writeString(buf, `${e.x};${e.y};${e.t}`);
      } else if (ep.e.ty == 'swipe') {
        const e = ep.e as DxSwipeEvent;
        await DXPK.writeString(
          buf,
          `${e.x};${e.y};${e.dx};${e.dy};${e.t0};${e.t1}`
        );
      } else if (ep.e.ty == 'key') {
        const e = ep.e as DxKeyEvent;
        await DXPK.writeString(buf, `${e.k};${e.c};${e.t}`);
      } else if (ep.e.ty == 'text') {
        const e = ep.e as DxTextEvent;
        await DXPK.writeString(buf, `${base64.encode(e.x)};${e.t}`);
      } else if (ep.e.ty == 'hsk') {
        const e = ep.e as DxHideSoftKeyboardEvent;
        await DXPK.writeString(buf, `${e.t}`);
      } else {
        throw new IllegalStateError(`Unsupported event type: ${ep.e.ty}`);
      }
    }

    await Deno.writeFile(path, buf.bytes());
  }

  static async writeNumber(buf: Deno.Buffer, x: number, newline = true) {
    await DXPK.writeString(buf, String(x), newline);
  }

  static async writeString(buf: Deno.Buffer, str: string, newline = true) {
    await buf.write(DXPK.ENCODER.encode(str + (newline ? '\n' : '')));
  }
}

export default class DxPacker {
  // view pool: views that are same are saved only 1 copy
  private readonly vpool: DxView[] = [];
  // fragment pool: many fragments are same as well
  private readonly fpool: DxFragment[] = [];
  // event sequence: one by one
  private readonly eseq: EventPack[] = [];

  constructor(public readonly dev: DevInfo, public readonly app: string) {}

  get viewPool(): DxView[] {
    return this.vpool.slice();
  }

  get fragmentPool(): DxFragment[] {
    return this.fpool.slice();
  }

  get eventSeq(): EventPack[] {
    return this.eseq.slice();
  }

  append(e: DxEvent): void {
    this.infoLog(e);
    this.eseq.push(this.pack(e));
  }

  pack(e: DxEvent): EventPack {
    if (e.ui.app != this.app) {
      throw new IllegalStateError(
        `Cannot pack events from other apps, the expected app is ${this.app}`
      );
    }
    const ap = this.packUi(e.ui);
    return new EventPack(e, ap);
  }

  unpack(ep: EventPack): DxEvent {
    if (ep.up.app != this.app) {
      throw new IllegalStateError(
        `Cannot unpack events from other apps, the expected app is ${this.app}`
      );
    }
    const ui = this.unpackUi(ep.up);
    return ep.e.copy(ui);
  }

  async save(path: string): Promise<void> {
    await DXPK.dump(path, {
      app: this.app,
      dev: this.dev,
      vpool: this.vpool.slice(),
      fpool: this.fpool.slice(),
      eseq: this.eseq.slice(),
    });
  }

  static async load(path: string): Promise<DxPacker> {
    const dxpk = await DXPK.load(path);
    const packer = new DxPacker(dxpk.dev, dxpk.app);
    for (const v of dxpk.vpool) {
      packer.vpool.push(v as DxView);
    }
    for (const f of dxpk.fpool) {
      packer.fpool.push(f);
    }
    for (const e of dxpk.eseq) {
      packer.eseq.push(e);
    }
    return packer;
  }

  private packUi(a: DxCompatUi): CompatUiPack {
    const { app, name, decorView, fragmentManager } = a;
    const vTree = this.packView(decorView!); // eslint-disable-line
    const fInd = this.packFragmentManager(fragmentManager);
    const pack = new CompatUiPack(app, name, vTree, fInd);
    return pack;
  }

  private packView(v: DxView): KnaryTree<number> {
    v.detach(); // detach from its parent
    let ind = -1;
    for (const i in this.vpool) {
      if (v.equals(this.vpool[i])) {
        ind = Number(i);
        break;
      }
    }
    if (ind == -1) {
      // not in pool, put to pool
      ind = this.vpool.length;
      this.vpool.push(v);
    } else {
      // in pool, drop it
      // this.cache.put(v);
      /* do nothing, maybe put to cache */
    }
    const node = new KnaryTree<number>(ind);
    for (const c of v.children.slice(0)) {
      node.addChildTree(this.packView(c));
    }
    return node;
  }

  private packFragmentManager(fm: FragmentManager): number[] {
    const indices = [];
    for (const fr of fm.added) {
      let found = -1;
      for (let i = 0; i < this.fpool.length; i++) {
        if (fr.equals(this.fpool[i])) {
          found = i;
          break;
        }
      }
      if (found == -1) {
        found = this.fpool.length;
        this.fpool.push(fr);
      }
      indices.push(found);
      // TODO: fragment are also fragment owner, and should
      // also be detached, and packed recursively
    }
    return indices;
  }

  private unpackUi(ap: CompatUiPack): DxCompatUi {
    const ui = new DxCompatUi(ap.app, ap.name);
    const v = this.unpackView(ap.vTree);
    if (!(v instanceof DxDecorView)) {
      throw new IllegalStateError('Expect a DxDecorView as root');
    }
    ui.replaceDecor(v as DxDecorView);
    ui.buildDrawingLevelLists();
    this.unpackFragment(ui, ap.fInd);
    return ui;
  }

  private unpackView(ci: KnaryTree<number>): DxView {
    const v = this.vpool[ci.value];
    const cv: DxView = v.copy();
    for (const cci of ci.children()) {
      cv.addView(this.unpackView(cci));
    }
    return cv;
  }

  private unpackFragment(ui: DxCompatUi, indices: number[]) {
    for (const ind of indices) {
      const fr = this.fpool[ind];
      if (fr.active) {
        ui.fragmentManager.activateFragment(this.fpool[ind].props);
      } else {
        ui.fragmentManager.addFragment(this.fpool[ind].props);
      }
    }
  }

  private infoLog(e: DxEvent) {
    /* eslint-disable */
    switch (e.ty) {
      case 'tap':
        this.infoLogInner(
          e,
          ViewFinder.findViewByXY(
            e.ui.decorView!,
            (e as DxTapEvent).x,
            (e as DxTapEvent).y
          )
        );
        break;

      case 'double-tap':
        this.infoLogInner(
          e,
          ViewFinder.findViewByXY(
            e.ui.decorView!,
            (e as DxDoubleTapEvent).x,
            (e as DxDoubleTapEvent).y
          )
        );
        break;

      case 'long-tap':
        this.infoLogInner(
          e,
          ViewFinder.findViewByXY(
            e.ui.decorView!,
            (e as DxLongTapEvent).x,
            (e as DxLongTapEvent).y
          )
        );
        break;

      case 'swipe':
        this.infoLogInner(
          e,
          ViewFinder.findViewByXY(
            e.ui.decorView!,
            (e as DxSwipeEvent).x,
            (e as DxSwipeEvent).y
          )
        );
        break;

      case 'key':
      case 'text':
      case 'hsk':
        this.infoLogInner(e, null);
        break;
    }
  }

  private infoLogInner(e: DxEvent, v: DxView | null) {
    if (e.ty == 'key' || e.ty == 'text' || e.ty == 'hsk') {
      DxLog.info(e.toString());
    } else if (v) {
      DxLog.info(
        `${e.toString()} cls=${v.cls} id="${v.resId}" text="${v.text}" desc="${
          v.desc
        }" x=${v.x}-${v.x + v.width} y=${v.y}-${v.y + v.height} z=${v.z}`
      );
    }
  }
}
