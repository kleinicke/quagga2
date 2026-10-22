import { describe, it } from 'mocha';
import { expect } from 'chai';
import Bresenham from '../bresenham';

// A 6 x 4 gray image whose value is 10 * x + 50 * y.
function gradient(width = 6, height = 4) {
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            data[y * width + x] = 10 * x + 50 * y;
        }
    }
    return { data, size: { x: width, y: height } };
}

describe('Bresenham', () => {
    describe('getSampledLine', () => {
        it('interpolates between pixels and averages three rows', () => {
            const { line, min, max } = Bresenham.getSampledLine(gradient(), { x: 0.5, y: 1.5 }, { x: 4.5, y: 1.5 });
            // Rows 0.5, 1.5 and 2.5 average to row 1.5; x is sampled at 0.5, 1.5, 2.5, 3.5.
            expect(line).to.have.lengthOf(4);
            line.forEach((value: number, i: number) => expect(value).to.be.closeTo(10 * (i + 0.5) + 75, 1e-9));
            expect(min).to.be.closeTo(80, 1e-9);
            expect(max).to.be.closeTo(110, 1e-9);
        });

        it('takes the nearest edge pixel outside the image', () => {
            const { line } = Bresenham.getSampledLine(gradient(), { x: -3, y: 0 }, { x: 0, y: 0 });
            // Rows -1, 0 and 1 clamp to 0, 0 and 1.
            line.forEach((value: number) => expect(value).to.be.closeTo(50 / 3, 1e-9));
        });

        it('returns an empty line for identical points', () => {
            expect(Bresenham.getSampledLine(gradient(), { x: 2, y: 2 }, { x: 2, y: 2 }).line).to.be.empty;
        });

        it('stays defined on a one-pixel-high image', () => {
            const { line } = Bresenham.getSampledLine(gradient(6, 1), { x: 0, y: 0 }, { x: 5, y: 0 });
            line.forEach((value: number, i: number) => expect(value).to.be.closeTo(10 * i, 1e-9));
        });
    });
});
