/**
 * Vitest Test Setup
 *
 * This file runs before each test file.
 * Configure global mocks and testing utilities here.
 */

// Import jest-dom matchers for Vitest (extends Vitest expect types)
import '@testing-library/jest-dom/vitest';

// Import fake-indexeddb for IndexedDB tests
import 'fake-indexeddb/auto';

// Only run DOM-related setup if we're in jsdom environment
if (typeof window !== 'undefined') {

  // Mock window.matchMedia for responsive tests
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  // Mock ResizeObserver for component tests
  global.ResizeObserver = class ResizeObserver {
    constructor(_callback: ResizeObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  // Mock WebGL context for Three.js tests
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).getContext = function (contextType: string) {
    if (contextType === 'webgl' || contextType === 'webgl2') {
      return {
        canvas: this,
        getExtension: () => null,
        getParameter: () => [],
        createTexture: () => ({}),
        bindTexture: () => {},
        texParameteri: () => {},
        texImage2D: () => {},
        createBuffer: () => ({}),
        bindBuffer: () => {},
        bufferData: () => {},
        createProgram: () => ({}),
        createShader: () => ({}),
        shaderSource: () => {},
        compileShader: () => {},
        attachShader: () => {},
        linkProgram: () => {},
        getProgramParameter: () => true,
        useProgram: () => {},
        getAttribLocation: () => 0,
        getUniformLocation: () => ({}),
        enableVertexAttribArray: () => {},
        vertexAttribPointer: () => {},
        uniform1i: () => {},
        uniform2f: () => {},
        uniform4f: () => {},
        uniformMatrix4fv: () => {},
        drawArrays: () => {},
        drawElements: () => {},
        viewport: () => {},
        clearColor: () => {},
        clear: () => {},
        enable: () => {},
        disable: () => {},
        blendFunc: () => {},
        depthFunc: () => {},
        cullFace: () => {},
        frontFace: () => {},
        activeTexture: () => {},
        deleteTexture: () => {},
        deleteBuffer: () => {},
        deleteProgram: () => {},
        deleteShader: () => {},
        getShaderParameter: () => true,
        getShaderInfoLog: () => '',
        getProgramInfoLog: () => '',
        createFramebuffer: () => ({}),
        bindFramebuffer: () => {},
        framebufferTexture2D: () => {},
        checkFramebufferStatus: () => 36053, // FRAMEBUFFER_COMPLETE
        createRenderbuffer: () => ({}),
        bindRenderbuffer: () => {},
        renderbufferStorage: () => {},
        framebufferRenderbuffer: () => {},
        pixelStorei: () => {},
        generateMipmap: () => {},
      } as unknown as WebGLRenderingContext;
    }
    return null;
  };
}
