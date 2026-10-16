import assert from 'node:assert/strict';
import Test from '../../../helpers/option-test.ts';

describe('Option `strip-spaces`, process', function() {
  describe('css', function() {
    it('Invalid value should not trim trailing spaces', function() {
      let test = new Test(this, {'strip-spaces': 'foobar'}, {warns: true});
      return test.comb.processString('a { color: red }  \n')
          .then(function(actual) {
            assert.equal(actual, 'a { color: red }  \n');
          });
    });

    it('Boolean true value should trim all trailing spaces', function() {
      let test = new Test(this, {'strip-spaces': true});
      return test.comb.processString(
          'a { color: red }   \n' +
          'a{color:red}\t /* foobar */\t \n' +
          'a {color:red}  \n   \n'
      ).then(function(actual) {
        assert.equal(actual,
            'a { color: red }\n' +
            'a{color:red}\t /* foobar */\n' +
            'a {color:red}\n');
      });
    });

    it('Boolean true value should trim trailing spaces at eof', function() {
      let test = new Test(this, {'strip-spaces': true});
      return test.comb.processString(
          'a {color:red}  '
      ).then(function(actual) {
        assert.equal(actual, 'a {color:red}');
      });
    });
  });

  describe('whitespace-only input', function() {
    it('Should not throw', function() {
      let test = new Test(this, {'strip-spaces': true, 'eof-newline': true});
      return test.comb.processString('\n  \n').then(function(actual) {
        assert.equal(actual, '\n');
      });
    });
  });

  describe('sass', function() {
    it('Should strip trailing spaces left in the last block', async function() {
      let test = new Test(this, {'strip-spaces': true});
      let actual = await test.comb.processString('@for $i from 1 through 2 //\n  \n', {syntax: 'sass'});
      assert.equal(actual, '@for $i from 1 through 2 //\n\n');
    });
  });
});
