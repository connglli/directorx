const {
  utils: { ViewFinder, Views },
} = global;

class AppendTripleDotsWithFile {
  async normalize(ui, dev) {
    ViewFinder.walk(ui.decorView, (v) => {
      // we are here javascript, so we have the ability to
      // modify the readonly attribute
      if (
        v.cls ==
          'com.microsoft.office.ui.controls.datasourcewidgets.FSMenuButton' &&
        v.resEntry == 'strongAppQatFsMenuButton' &&
        v.text == '' &&
        v.desc == '' &&
        Views.isViewImportantForA11y(v) &&
        Views.isVisibleToUser(v, dev)
      ) {
        v.props.text = 'File';
      }
    });
    return ui;
  }
}

module.exports = {
  create: function () {
    return new AppendTripleDotsWithFile();
  },
};
