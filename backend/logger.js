// Standalone logger module to avoid circular imports
import pino from 'pino';

const isDev = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  ...(isDev && { transport: { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } } }),
});
