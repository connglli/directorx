const {
  input,
  algo,
  utils: { Errors, Events, Views, ViewFinder },
} = global;

const args = {};

async function tryVagueLookahead(view, seq, kVal, playee) {
  if (view.text.length != 0 || seq.size() <= 0) {
    return [-1, null];
  }
  const nextK = seq.topN(kVal);
  for (let i = 0; i < nextK.length; i++) {
    const ne = nextK[i];
    // we come across an non-xy event, fail
    if (!Events.isXYEvent(ne)) {
      return [-1, null];
    }

    // find the view in recordee
    const nv = ne.ui.findViewByXY(ne.x, ne.y);
    if (nv == null) {
      throw new IllegalStateError(
        `No visible view found on recordee tree at (${ne.x}, ${ne.y})`
      );
    }

    // find its target view map in playee
    const nvm = await algo.adaptiveSelect(input, nv);
    if (nvm != null && nvm.visible) {
      return [
        i,
        {
          v: nvm,
          x0: nvm.bounds.left,
          x1: nvm.bounds.right,
          y0: nvm.bounds.top,
          y1: nvm.bounds.bottom,
        },
      ];
    } else if (nvm == null) {
      // vague select an view
      const nvv = vagueSelect(nv, playee);
      if (nvv) {
        return [
          i,
          {
            v: nvv,
            x0: Views.x0(nvv),
            x1: Views.x1(nvv),
            y0: Views.y0(nvv),
            y1: Views.y1(nvv),
          },
        ];
      }
    }
  }
  return [-1, null];
}

function vagueSelect(view, playee) {
  if (view.text.length <= 0 && view.desc.length <= 0) {
    return null;
  }
  let text, prop;
  if (view.text.length > 0) {
    text = view.text;
    prop = 'desc';
  } else {
    text = view.desc;
    prop = 'text';
  }
  return ViewFinder.findView(
    playee.ui.decorView,
    (w) => Views.isVisibleToUser(w, playee.dev) && w[prop] == text // exactly match
  );
}

plugin.name = function () {
  return `transform:text-desc-lookahead:${args.K}`;
};

plugin.onCreate = function (argv) {
  args.K = argv['K'] === undefined ? 1 : Number(argv['K']);
};

plugin.apply = async function ({ seq, view, recordee, playee }) {
  const [popped, matched] = await tryVagueLookahead(view, seq, args.K, playee);
  if (popped < 0) {
    return false;
  }
  seq.popN(popped);
  const e = seq.pop();
  switch (e.ty) {
    case 'tap':
      await input.tap(matched.x0 + 1, matched.y0 + 1);
      break;
    case 'double-tap':
      await input.doubleTap(matched.x0 + 1, matched.y0 + 1);
      break;
    case 'long-tap':
      await input.longTap(matched.x0 + 1, matched.y0 + 1);
      break;
    case 'swipe': {
      const { dx, dy, t0, t1 } = e;
      const duration = t1 - t0;
      const rDev = recordee.dev;
      const pDev = playee.dev;
      const fromX = dx >= 0 ? matched.x0 + 1 : matched.x1 - 1;
      const fromY = dy >= 0 ? matched.y0 + 1 : matched.y1 - 1;
      let realDx = (dx / rDev.width) * pDev.width;
      let realDy = (dy / rDev.height) * pDev.height;
      if (fromY + realDy <= 0) {
        realDy = -fromY + 1;
      }

      await input.swipe(fromX, fromY, realDx, realDy, duration);
      break;
    }
    default:
      throw new Errors.CannotReachHereError();
  }
  return true;
};
