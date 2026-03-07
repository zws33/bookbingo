type EventDispatcher = (name: string, params?: Record<string, unknown>) => void;

let _isDev = false;
let _dispatch: EventDispatcher | null = null;

export function initLogger(options: { isDev: boolean; dispatch: EventDispatcher | null }): void {
  _isDev = options.isDev;
  _dispatch = options.dispatch;
}

export const log = {
  debug: (label: string, ...args: unknown[]): void => {
    if (_isDev) console.debug(`[${label}]`, ...args);
  },
  error: (label: string, ...args: unknown[]): void => {
    console.error(`[${label}]`, ...args);
    const first = args[0];
    const message = first instanceof Error ? first.message : String(first ?? '');
    _dispatch?.('app_error', { label, message });
  },
  event: (name: string, params?: Record<string, unknown>): void => {
    _dispatch?.(name, params);
  },
};
