type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  if (level === 'debug' && !import.meta.env.DEV) return;
  if (level === 'warn' && !import.meta.env.DEV) return;

  const prefix = `[respectify:${level}]`;
  if (data) {
    console[level === 'debug' ? 'log' : level](prefix, message, data);
  } else {
    console[level === 'debug' ? 'log' : level](prefix, message);
  }
}

export const logger = {
  debug: (message: string, data?: Record<string, unknown>) => log('debug', message, data),
  info: (message: string, data?: Record<string, unknown>) => log('info', message, data),
  warn: (message: string, data?: Record<string, unknown>) => log('warn', message, data),
  error: (message: string, data?: Record<string, unknown>) => log('error', message, data),
};
