/**
 * @jest-environment jsdom
 */

import { numberExtensions } from '@/Extensions/NumberExtensions';
import { evaluate } from './Helpers';

describe('Data Transformation Functions', () => {
	describe('Number Data Transformation Functions', () => {
		test('.random() should work correctly on a number', () => {
			expect(evaluate('={{ Number(100).random() }}')).not.toBeUndefined();
		});

		test('.isBlank() should work correctly on a number', () => {
			expect(evaluate('={{ Number(100).isBlank() }}')).toEqual(false);
		});

		test('.isPresent() should work correctly on a number', () => {
			expect(evaluate('={{ Number(100).isPresent() }}')).toEqual(
				numberExtensions.functions.isPresent(100),
			);
		});

		test('.format() should work correctly on a number', () => {
			expect(evaluate('={{ Number(100).format() }}')).toEqual(
				numberExtensions.functions.format(100, []),
			);
		});

		test('.ceil() should work on a number', () => {
			expect(evaluate('={{ (1.2).ceil() }}')).toEqual(2);
			expect(evaluate('={{ (1.9).ceil() }}')).toEqual(2);
			expect(evaluate('={{ (1.0).ceil() }}')).toEqual(1);
			expect(evaluate('={{ (NaN).ceil() }}')).toBeNaN();
		});

		test('.floor() should work on a number', () => {
			expect(evaluate('={{ (1.2).floor() }}')).toEqual(1);
			expect(evaluate('={{ (1.9).floor() }}')).toEqual(1);
			expect(evaluate('={{ (1.0).floor() }}')).toEqual(1);
			expect(evaluate('={{ (NaN).floor() }}')).toBeNaN();
		});

		test('.round() should work on a number', () => {
			expect(evaluate('={{ (1.3333333).round(3) }}')).toEqual(1.333);
			expect(evaluate('={{ (1.3333333).round(0) }}')).toEqual(1);
			expect(evaluate('={{ (1.5001).round(0) }}')).toEqual(2);
			expect(evaluate('={{ (NaN).round(3) }}')).toBeNaN();
		});

		test('.isTrue() should work on a number', () => {
			expect(evaluate('={{ (1).isTrue() }}')).toEqual(true);
			expect(evaluate('={{ (0).isTrue() }}')).toEqual(false);
			expect(evaluate('={{ (NaN).isTrue() }}')).toEqual(false);
		});

		test('.isFalse() should work on a number', () => {
			expect(evaluate('={{ (1).isFalse() }}')).toEqual(false);
			expect(evaluate('={{ (0).isFalse() }}')).toEqual(true);
			expect(evaluate('={{ (NaN).isFalse() }}')).toEqual(false);
		});

		test('.isOdd() should work on a number', () => {
			expect(evaluate('={{ (9).isOdd() }}')).toEqual(true);
			expect(evaluate('={{ (8).isOdd() }}')).toEqual(false);
			expect(evaluate('={{ (0).isOdd() }}')).toEqual(false);
			expect(evaluate('={{ (NaN).isOdd() }}')).toEqual(false);
		});

		test('.isEven() should work on a number', () => {
			expect(evaluate('={{ (9).isEven() }}')).toEqual(false);
			expect(evaluate('={{ (8).isEven() }}')).toEqual(true);
			expect(evaluate('={{ (0).isEven() }}')).toEqual(true);
			expect(evaluate('={{ (NaN).isEven() }}')).toEqual(false);
		});
	});

	describe('Multiple expressions', () => {
		test('Basic multiple expressions', () => {
			expect(evaluate('={{ "Test".sayHi() }} you have ${{ (100).format() }}.')).toEqual(
				'hi Test you have $100.',
			);
		});
	});
});
