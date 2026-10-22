/* eslint-disable @typescript-eslint/ban-ts-comment */
import { expect } from 'chai';
import { describe, it, beforeEach } from 'mocha';
import Quagga from '../quagga';
import QuaggaStatic from '../../quagga';
import type { Box } from '../transform';

describe('src/quagga/quagga.ts', () => {
    describe('locateAndDecode', () => {
        const box = [[0, 0], [10, 0], [10, 10], [0, 10]];
        const fallback = { codeResult: { code: '123', format: 'ean_13' }, line: [], box: [] };
        let quagga: Quagga;
        let published: any[];
        let scanlineCalls: number;

        function setup(config: any, boxes: any, boxResult: any) {
            quagga = new Quagga();
            published = [];
            scanlineCalls = 0;
            quagga.context.config = config;
            quagga.context.decoder = {
                decodeFromBoundingBoxes: async () => boxResult,
                decodeFromImage: async () => null,
                decodeFromScanlines: () => { scanlineCalls++; return fallback; },
            } as any;
            quagga.getBoundingBoxes = () => boxes;
            quagga.publishResult = (result: any) => { published.push(result); };
        }

        it('should scan lines when the locator finds no box', async () => {
            setup({ locate: true, decoder: {} }, null, null);
            await quagga.locateAndDecode();
            expect(published[0]).to.equal(fallback);
        });

        it('should scan lines when no located box decodes', async () => {
            setup({ locate: true, decoder: { multiple: true } }, [box], { barcodes: [{ box }] });
            await quagga.locateAndDecode();
            expect(published[0].barcodes).to.deep.equal([{ box }, fallback]);
            expect(published[0].boxes).to.deep.equal([box]);
        });

        it('should not scan lines when a box decodes', async () => {
            setup({ locate: true, decoder: {} }, [box], { codeResult: { code: '456' }, box });
            await quagga.locateAndDecode();
            expect(scanlineCalls).to.equal(0);
            expect(published[0].codeResult.code).to.equal('456');
        });

        it('should not scan lines when locate is off', async () => {
            setup({ locate: false, decoder: {} }, [box], { barcodes: [] });
            await quagga.locateAndDecode();
            expect(scanlineCalls).to.equal(0);
        });
    });

    describe('transformResult', () => {
        let quagga: Quagga;

        beforeEach(() => {
            quagga = new Quagga();
            // Mock the input stream with a non-zero top-right offset
            quagga.context.inputStream = {
                getTopRight: () => ({ x: 100, y: 50 }),
            } as any;
        });

        it('should transform result.box when present', () => {
            const result = {
                box: [[0, 0], [320, 0], [320, 240], [0, 240]] as Box,
            };
            quagga.transformResult(result);
            expect(result.box).to.deep.equal([[100, 50], [420, 50], [420, 290], [100, 290]]);
        });

        it('should transform result.boxes when present', () => {
            const result = {
                boxes: [
                    [[0, 0], [320, 0], [320, 240], [0, 240]] as Box,
                    [[10, 10], [310, 10], [310, 230], [10, 230]] as Box,
                ],
            };
            quagga.transformResult(result);
            expect(result.boxes[0]).to.deep.equal([[100, 50], [420, 50], [420, 290], [100, 290]]);
            expect(result.boxes[1]).to.deep.equal([[110, 60], [410, 60], [410, 280], [110, 280]]);
        });

        it('should NOT double-transform when result.box is same reference as result.boxes[i]', () => {
            // This is the bug fix test case
            // result.box and result.boxes[0] are the SAME object reference
            // The fix ensures we only transform it once
            const sharedBox: Box = [[0, 0], [320, 0], [320, 240], [0, 240]];
            const result = {
                box: sharedBox,
                boxes: [sharedBox],  // Same reference as result.box
            };

            quagga.transformResult(result);

            // Should only be transformed once (offset by 100, 50)
            // NOT twice (which would be offset by 200, 100)
            expect(result.box).to.deep.equal([[100, 50], [420, 50], [420, 290], [100, 290]]);
            expect(result.boxes[0]).to.deep.equal([[100, 50], [420, 50], [420, 290], [100, 290]]);
        });

        it('should transform both box and unrelated boxes separately', () => {
            // result.box is a different object from result.boxes entries
            const box1: Box = [[0, 0], [320, 0], [320, 240], [0, 240]];
            const box2: Box = [[10, 10], [310, 10], [310, 230], [10, 230]];
            const result = {
                box: box1,
                boxes: [box2],  // Different reference from result.box
            };

            quagga.transformResult(result);

            expect(result.box).to.deep.equal([[100, 50], [420, 50], [420, 290], [100, 290]]);
            expect(result.boxes[0]).to.deep.equal([[110, 60], [410, 60], [410, 280], [110, 280]]);
        });

        it('should not transform anything when offset is zero', () => {
            quagga.context.inputStream = {
                getTopRight: () => ({ x: 0, y: 0 }),
            } as any;

            const result = {
                box: [[0, 0], [320, 0], [320, 240], [0, 240]] as Box,
                boxes: [[[10, 10], [310, 10], [310, 230], [10, 230]] as Box],
            };

            quagga.transformResult(result);

            // Should remain unchanged
            expect(result.box).to.deep.equal([[0, 0], [320, 0], [320, 240], [0, 240]]);
            expect(result.boxes[0]).to.deep.equal([[10, 10], [310, 10], [310, 230], [10, 230]]);
        });

        it('should transform result.line when present', () => {
            const result = {
                line: [
                    { x: 10, y: 20 },
                    { x: 100, y: 200 },
                ],
            };

            quagga.transformResult(result);

            expect(result.line[0]).to.deep.include({ x: 110, y: 70 });
            expect(result.line[1]).to.deep.include({ x: 200, y: 250 });
        });

        it('should NOT double-transform when multiple:true and boxes shared between parent and barcodes', () => {
            // This simulates the multiple:true scenario where:
            // - Parent result has boxes array
            // - Each barcode in barcodes has a box that references the same object in boxes
            const box1: Box = [[0, 0], [320, 0], [320, 240], [0, 240]];
            const box2: Box = [[10, 10], [310, 10], [310, 230], [10, 230]];
            const result = {
                boxes: [box1, box2],  // Parent has all boxes
                barcodes: [
                    { box: box1, codeResult: { code: '123' } },  // Same reference as boxes[0]
                    { box: box2, codeResult: { code: '456' } },  // Same reference as boxes[1]
                ],
            };

            quagga.transformResult(result);

            // Each box should only be transformed once (offset by 100, 50)
            // NOT twice (which would happen if parent.boxes and barcode.box both transform)
            expect(result.boxes[0]).to.deep.equal([[100, 50], [420, 50], [420, 290], [100, 290]]);
            expect(result.boxes[1]).to.deep.equal([[110, 60], [410, 60], [410, 280], [110, 280]]);
            expect(result.barcodes[0].box).to.deep.equal([[100, 50], [420, 50], [420, 290], [100, 290]]);
            expect(result.barcodes[1].box).to.deep.equal([[110, 60], [410, 60], [410, 280], [110, 280]]);
        });
    });

    describe('canRecord', () => {
        let quagga: Quagga;

        beforeEach(() => {
            quagga = new Quagga();
        });

        it('should call callback with error when initAborted is true', (done) => {
            quagga.context.initAborted = true;
            quagga.canRecord((err?: Error) => {
                expect(err).to.be.instanceOf(Error);
                expect(err?.message).to.equal('Initialization was aborted');
                done();
            });
        });

        it('should call callback with error when config is null', (done) => {
            quagga.context.config = undefined;
            quagga.canRecord((err?: Error) => {
                expect(err).to.be.instanceOf(Error);
                expect(err?.message).to.equal('Configuration not initialized');
                done();
            });
        });

        it('should call callback with error when inputStream is null', (done) => {
            quagga.context.config = { inputStream: { type: 'ImageStream' } };
            quagga.context.inputStream = null;
            quagga.canRecord((err?: Error) => {
                expect(err).to.be.instanceOf(Error);
                expect(err?.message).to.equal('Input stream not initialized');
                done();
            });
        });

        it('should call callback with error when inputStream is not initialized', () => {
            quagga.context.initAborted = false;
            quagga.context.config = { inputStream: { type: 'ImageStream' } };
            // Don't set inputStream, so it will fail with the inputStream error
            let receivedError: Error | undefined;
            quagga.canRecord((err?: Error) => {
                receivedError = err;
            });
            expect(receivedError).to.be.instanceOf(Error);
            expect(receivedError?.message).to.equal('Input stream not initialized');
        });
    });

    describe('stop', () => {
        let quagga: Quagga;

        beforeEach(() => {
            quagga = new Quagga();
        });

        it('should set initAborted to true when framegrabber is not initialized', async () => {
            quagga.context.framegrabber = null;
            await quagga.stop();
            expect(quagga.context.initAborted).to.be.true;
        });

        it('should not set initAborted when framegrabber is initialized', async () => {
            quagga.context.framegrabber = {}; // mock framegrabber
            quagga.context.initAborted = false;
            await quagga.stop();
            expect(quagga.context.initAborted).to.be.false;
        });
    });

    describe('drawScannerArea', () => {
        it('exposes drawScannerArea as a function', () => {
            expect(QuaggaStatic).to.be.an('object');
            expect((QuaggaStatic as any).drawScannerArea).to.be.a('function');
        });

        it('calling drawScannerArea without init does not throw', () => {
            // Should be a no-op when not configured
            expect(() => (QuaggaStatic as any).drawScannerArea()).to.not.throw();
        });
    });
});
