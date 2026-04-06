declare interface Buffer extends Uint8Array {
  readUInt32BE(offset: number): number
  readUInt16BE(offset: number): number
  equals(other: Buffer): boolean
  subarray(start?: number, end?: number): Buffer
  toString(encoding?: string): string
}

declare const Buffer: {
  from(data: string, encoding?: string): Buffer
  from(data: number[]): Buffer
  from(data: ArrayLike<number>): Buffer
}

declare module 'node:fs/promises' {
  export type Dirent = {
    name: string
    isDirectory(): boolean
    isFile(): boolean
  }

  export type Stats = {
    size: number
    isDirectory(): boolean
  }

  export function readdir(path: string, options?: { withFileTypes?: false }): Promise<string[]>
  export function readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>
  export function readFile(path: string, encoding: 'utf8'): Promise<string>
  export function readFile(path: string): Promise<Buffer>
  export function writeFile(path: string, data: string | Uint8Array, encoding?: 'utf8'): Promise<void>
  export function copyFile(source: string, destination: string): Promise<void>
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
  export function rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>
  export function mkdtemp(prefix: string): Promise<string>
  export function stat(path: string): Promise<Stats>
}

declare module 'node:path' {
  const pathModule: {
    resolve(...segments: string[]): string
    join(...segments: string[]): string
    relative(from: string, to: string): string
    dirname(input: string): string
    basename(input: string, suffix?: string): string
    extname(input: string): string
    sep: string
  }
  export default pathModule
}

declare module 'node:os' {
  export function tmpdir(): string
}
