const { logger } = global;
const { BottomUpRecognizer } = global.algo.defaults;

class LoggingRecognizer {
  constructor(recogn) {
    this.recogn = recogn;
  }

  async recognize(args) {
    logger.warning("Let's Recognize");
    return await this.recogn.recognize(args);
  }
}

function withLogger(recogn) {
  return new LoggingRecognizer(recogn);
}

module.exports = {
  create() {
    return Promise.resolve(withLogger(new BottomUpRecognizer()));
  },
};
