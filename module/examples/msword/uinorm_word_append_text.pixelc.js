const {
  utils: { ViewFinder },
} = global;

class MsWordAppendTextForButton {
  async normalize(ui) {
    ViewFinder.walk(ui.decorView, (v) => {
      // we are here javascript, so we have the ability to
      // modify the readonly attribute
      if (
        v.cls ==
          'com.microsoft.office.ui.controls.datasourcewidgets.FSImmersiveGalleryButton' &&
        v.resEntry == 'fsImmersiveGalleryButton' &&
        v.text == '' &&
        v.desc != ''
      ) {
        v.props.text = v.desc;
      }
    });
    return ui;
  }
}

module.exports = {
  create: async function () {
    return new MsWordAppendTextForButton();
  },
};
