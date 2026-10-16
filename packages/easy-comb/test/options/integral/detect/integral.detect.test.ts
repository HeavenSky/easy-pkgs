import Test from '../../../helpers/option-test.ts';

describe('Option `integral`, detect', function() {
  describe('css', function() {
    it('Should detect everything in integral test', function() {
      let test = new Test(this);
      let input = test.readFile('integral.expected.css');
      // Clone the required config object, otherwise other tests would fail.
      let expected = JSON.parse(JSON.stringify(test.legacyConfig()));
      delete expected['sort-order'];
      delete expected.exclude;
      // The default csscomb.json has no tab-size and lines-between-rulesets
      // options.
      expected['tab-size'] = 4;
      expected['lines-between-rulesets'] = 1;
      test.shouldDetect(undefined, input, expected);
    });
  });
});
