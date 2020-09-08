const app = global.app;
const log = global.logger;

module.exports = {
  async onCreate(args) {
    log.info(`Directorx for ${app} created`);
  },
  async onResume() {
    for (let i = 0; i < 3; i++) {
      log.info(`RESUME: ${i}`);
      await new Promise((resolve) =>
        setTimeout(() => {
          resolve();
        }, 1000)
      );
    }
  },
  async onStop() {
    log.info(`Directorx for ${app} stopped`);
  },
  async onUnhandledException(x) {
    log.info(`Directorx for ${app} exception`);
  },
};
