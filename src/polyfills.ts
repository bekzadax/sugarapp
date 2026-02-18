import { Buffer } from 'buffer';

const globalObject = globalThis as typeof globalThis & { Buffer?: typeof Buffer };

if (!globalObject.Buffer) {
  globalObject.Buffer = Buffer;
}
