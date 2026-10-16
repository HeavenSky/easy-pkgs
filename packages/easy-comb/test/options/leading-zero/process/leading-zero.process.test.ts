import assert from 'node:assert/strict';
import Test from '../../../helpers/option-test.ts';

describe('Option `leading-zero`, process', function() {
  describe('css', function() {
    it('Should add leading zero in dimensions', function() {
      let test = new Test(this, {'leading-zero': true});
      return test.comb.processString(
          'div { margin: .5em }'
      ).then(function(actual) {
        assert.equal(actual, 'div { margin: 0.5em }');
      });
    });

    it('Should remove leading zero in dimensions', function() {
      let test = new Test(this, {'leading-zero': false});
      return test.comb.processString(
          'div { margin: 0.5em }'
      ).then(function(actual) {
        assert.equal(actual, 'div { margin: .5em }');
      });
    });

    it('Should not add leading zero to a number glued to the previous token', async function() {
      let test = new Test(this, {'leading-zero': true});
      assert.equal(await test.comb.processString('a { b: 3e-2.1 3e-2.5px a .5 }'), 'a { b: 3e-2.1 3e-2.5px a 0.5 }');
    });
  });
});
