
declare module '@pencil.js/canvas-gif-encoder' {

    export interface EncoderOptions {
        alphaThreshold?: number;
        quality?: number;
    }

    export interface PartialImageData {
        data: Uint8ClampedArray<ArrayBufferLike>;
        height: number;
        width: number;
    }

    export default class CanvasGifEncoder {

        constructor(width: number, height: number, options: EncoderOptions);

        addFrame(ctx: {getImageData(sx: number, sy: number, sw: number, sh: number): PartialImageData} | PartialImageData, delay?: number): boolean;

        end(): Uint8Array;

        flush(): void;

    }

}
