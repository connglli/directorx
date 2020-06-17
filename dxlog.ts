import { log } from './deps.ts';

await log.setup({
  handlers: {
    console: new log.handlers.ConsoleHandler('DEBUG', {
      formatter: '{msg}'
    }),
  },
  loggers: {
    default: {
      level: 'DEBUG',
      handlers: ['console'],
    },
  },
});

const defaultLogger = log.getLogger('default');

const DxLog = {
  debug: defaultLogger.debug.bind(defaultLogger),
  info: defaultLogger.info.bind(defaultLogger),
  warning: defaultLogger.warning.bind(defaultLogger),
  error: defaultLogger.error.bind(defaultLogger),
  critical: defaultLogger.critical.bind(defaultLogger)
};

export default DxLog;

if (import.meta.main) {
  DxLog.debug('a');
  DxLog.info('b');
}