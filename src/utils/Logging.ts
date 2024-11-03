class TaichiError extends Error {
  constructor(message, info) {
    super(message); 
    this.name = this.constructor.name; 
    this.info = info; 
    Error.captureStackTrace(this, this.constructor); // Capture stack trace (V8 engines)
  }
}

export function log(...args: any[]) {
    console.log(...args);
}

export function error(...args: any[]) {
    if (typeof args[1] === 'object' && args[1] !== null) {
        const info = args[1];
        throw new TaichiError('Taichi JS ERROR ', info);
    } else {
        console.error('FATAL ERROR: ', ...args);
        throw new TaichiError('Taichi JS ERROR ', {});
    }
}

export function assert(val: boolean, ...args: any[]) {
    if (!val) {
        error('Assertion failed', args);
    }
}
