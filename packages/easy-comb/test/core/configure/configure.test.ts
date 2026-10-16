import Comb from '../../../src/csscomb.ts';
import assert from 'node:assert/strict';
import path from 'node:path';

describe('CSScomb#configure', function() {
  it('Passing no config to constructor should not configure anything', function() {
    let comb = new Comb();
    assert.equal(comb.config['sort-order'], undefined);
  });

  it('Passing valid config name to constructor should configure using correct config', function() {
    let comb = new Comb('csscomb');
    let input = 'a { color: tomato; top: 0; }';
    let expected = 'a {\n  top: 0;\n\n  color: tomato;\n}\n';
    return comb.processString(input).then(function(output) {
      assert.equal(expected, output);
    });
  });

  it('Passing config object to constructor should configure using that object', function() {
    let comb = new Comb({ 'always-semicolon': true });
    let input = 'a { color: tomato }';
    let expected = 'a { color: tomato; }';
    return comb.processString(input).then(function(actual) {
      assert.equal(actual, expected);
    });
  });

  it('new Comb() should be chainable', function() {
    let input = 'a { color: tomato; top: 0; }';
    let expected = 'a {\n  top: 0;\n\n  color: tomato;\n}\n';
    return (new Comb('csscomb')).processString(input).then(output => {
      assert.equal(expected, output);
    });
  });

  it('configure() should be chainable', function() {
    let input = 'a { color: tomato }';
    let expected = 'a { color: tomato; }';
    return (new Comb()).configure({ 'always-semicolon': true })
        .processString(input)
        .then(actual => {
            assert.equal(actual, expected);
        });
  });

  describe('warnings', function() {
    let warn: typeof console.warn;
    let messages: string[];

    beforeEach(function() {
      warn = console.warn;
      messages = [];
      console.warn = (message: string) => messages.push(message);
    });

    afterEach(function() {
      console.warn = warn;
    });

    it('should warn about invalid option values', function() {
      new Comb({'lines-between-rulesets': true} as Record<string, unknown>);
      assert.equal(messages.length, 1);
      assert.ok(messages[0].includes('lines-between-rulesets'));
    });

    it('should warn about unknown options', function() {
      new Comb({'lines-between-declarations': 2, exclude: [], verbose: false} as Record<string, unknown>);
      assert.deepEqual(messages,
          ['Unknown option "lines-between-declarations" is ignored.']);
    });
  });

  it('exclude should match absolute paths inside cwd (#174)', function() {
    let comb = new Comb({exclude: ['node_modules/**']});
    let file = path.join(process.cwd(), 'node_modules/tinyglobby/package.json');
    assert.equal(comb._shouldProcess(file), false);
    assert.equal(comb._shouldProcess(path.join(process.cwd(), 'src/core.ts')),
        true);
  });
});
