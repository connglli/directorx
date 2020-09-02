const MENU_DESC = ' menu';

plugin.name = function () {
  return 'transform:file-triple-dots';
};

plugin.apply = async function ({ view }) {
  const { input } = global;
  if (view.text == 'File' && view.desc == 'File tab') {
    const menu = (
      await input.select({
        descContains: MENU_DESC.trim(),
      })
    ).filter((m) => m['content-desc'] == MENU_DESC);
    if (menu.length == 1) {
      await input.tap(menu[0].bounds.left + 1, menu[0].bounds.top + 1);
      return true;
    } else if (menu.length > 0) {
      logger.warning('Multiple menu matches, fail');
    }
  }
  return false;
};
