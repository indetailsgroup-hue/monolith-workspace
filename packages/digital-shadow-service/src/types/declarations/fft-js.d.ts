declare module 'fft-js' {
  export function fft(signal: number[]): [number, number][];
  export function ifft(phasors: [number, number][]): [number, number][];
  export namespace util {
    function fftMag(fftResult: [number, number][]): number[];
    function fftFreq(fftResult: [number, number][], sampleRate: number): number[];
  }
}
