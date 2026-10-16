import assert from 'node:assert/strict';
import Test from '../../../helpers/option-test.ts';

describe('Option `color-shorthand`, process', function() {
  describe('css', function() {
    it('Should shrink hexadecimal colors to 3 symbols', function() {
      let test = new Test(this, {'color-shorthand': true});
      return test.comb.processString(
          'div { color: #aabbcc }'
      ).then(function(actual) {
        assert.equal(actual, 'div { color: #abc }');
      });
    });

    it('Should expand hexadecimal colors to 6 symbols', function() {
      let test = new Test(this, {'color-shorthand': false});
      return test.comb.processString(
          'div { color: #7ad }'
      ).then(function(actual) {
        assert.equal(actual, 'div { color: #77aadd }');
      });
    });

    it('Should save case while processing', function() {
      let test = new Test(this, {'color-shorthand': true});
      return test.comb.processString(
          'div { color: #fFAafF }'
      ).then(function(actual) {
        assert.equal(actual, 'div { color: #fAf }');
      });
    });

    it('Should shrink 8-digit colors only when every pair matches (#612)', function() {
      let test = new Test(this, {'color-shorthand': true});
      return test.comb.processString(
          'div { color: #0000004d; background: #aabbccdd; border-color: #aabbccde }'
      ).then(function(actual) {
        assert.equal(actual,
            'div { color: #0000004d; background: #abcd; border-color: #aabbccde }');
      });
    });

    it('Should expand 4-digit colors to 8 symbols (#612)', function() {
      let test = new Test(this, {'color-shorthand': false});
      return test.comb.processString(
          'div { color: #7ad8 }'
      ).then(function(actual) {
        assert.equal(actual, 'div { color: #77aadd88 }');
      });
    });
  });
});
