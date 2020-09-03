const { logger } = global;
const { IdentityUi } = global.algo.defaults;

class LoggingNormalizer {
  constructor(norm) {
    this.norm = norm;
  }

  async normalize(s, d) {
    logger.warning("Let's Normalize Ui");
    return await this.norm.normalize(s, d);
  }
}

function withLogger(norm) {
  return new LoggingNormalizer(norm);
}

module.exports = {
  create() {
    return Promise.resolve(withLogger(new IdentityUi()));
  },
};
