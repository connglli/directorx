const { logger } = global;
const { TfIdfMatcher } = global.algo.defaults;

class LoggingMatcher {
  constructor(matcher) {
    this.matcher = matcher;
  }

  async match(a, b) {
    logger.warning("Let's Matching");
    return await this.matcher.match(a, b);
  }
}

function withLogger(matcher) {
  return new LoggingMatcher(matcher);
}

module.exports = {
  create() {
    return Promise.resolve(withLogger(new TfIdfMatcher()));
  },
};
