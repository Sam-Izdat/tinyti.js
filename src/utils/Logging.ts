class TaichiJSError extends Error {
  info: any;

  constructor(message:string, info:any) {
    super(message); 
    this.name = 'TaichiJSError'; 
    this.info = info; 
    // Error.captureStackTrace(this, this.constructor); // Capture stack trace (V8 engines) 
  }
}

export function log(...args: any[]) {
    console.log(...args);
}

export function error(...args: any[]) {
    if (typeof args[0] === 'string' && typeof args[1] === 'object' && args[1] !== null) {
        const message = args[0];
        const info = args[1];
        console.error('FATAL ERROR: ' + message + `\nat:\n ${info.code} `);
        throw new TaichiJSError('Taichi JS ERROR: ' + message, info);
    } else {
        console.error('FATAL ERROR: ', ...args);
        throw new TaichiJSError('Taichi JS ERROR ', {});
    }
}

export function assert(val: boolean, ...args: any[]) {
    if (!val) {
        error('Assertion failed', args);
    }
}
