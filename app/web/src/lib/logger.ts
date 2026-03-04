const noop = () => {};

export const log = {
  debug: import.meta.env.DEV
    ? (label: string, ...args: unknown[]) => console.debug(`[${label}]`, ...args)
    : noop,
  error: (label: string, ...args: unknown[]) => console.error(`[${label}]`, ...args),
};
