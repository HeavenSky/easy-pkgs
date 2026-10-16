'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs/promises');
const coffee = require('coffee');
const helper = require('../support/helper');

const x = path.join(__dirname, '../..', 'bin', 'x.js');
// 调用栈的行首形如 "    at main (...)"
const STACK = /^\s+at /m;

describe('test/cli/argv.test.js', () => {
  const [tmp, cleanup] = helper.tmp();
  const run = (bin, args) => coffee.fork(bin, args, { cwd: tmp });

  beforeEach(cleanup);
  afterEach(cleanup);

  describe('unknown options', () => {
    it('should reject unknown flags and suggest the closest one', async () => {
      await fs.writeFile(path.join(tmp, 'package.json'), JSON.stringify({ name: 'root', version: '1.0.0' }));
      await run(helper.npminstall, ['--prodd', 'ms'])
        .expect('code', 1)
        .expect('stderr', /unknown option --prodd \(did you mean --prod\?\), run npd -h to list the options/)
        .notExpect('stderr', STACK)
        .end();
      await run(x, ['install', '--frozen-lockfil'])
        .expect('code', 1)
        .expect('stderr', /unknown option --frozen-lockfil \(did you mean --frozen-lockfile\?\), run npd-x install -h/)
        .end();
      await run(helper.npminstall, ['--no-frozen-lockfil'])
        .expect('code', 1)
        .expect('stderr', /did you mean --no-frozen-lockfile\?/)
        .end();
      await run(helper.npminstall, ['-gx'])
        .expect('code', 1)
        .expect('stderr', /unknown option -x in -gx/)
        .end();
      // 没有写任何文件
      assert.deepEqual(await fs.readdir(tmp), ['package.json']);
    });

    it('should accept known flags, negations, npm compatible flags, --key=value and everything after --', async () => {
      await run(helper.npminstall, [
        '--no-cache',
        '--no-save',
        '--no-write',
        '--no-lockfile',
        '--no-strict-ssl',
        '--no-audit',
        '--fund',
        '--loglevel',
        'error',
        '--foo_bar_haha=okok',
        '-gv',
        '--',
        '--not-a-flag',
      ])
        .expect('code', 0)
        .expect('stdout', /^npd v\d+\.\d+\.\d+/)
        .end();
    });
  });

  describe('user errors', () => {
    it('should print only the message without a call stack', async () => {
      await fs.writeFile(path.join(tmp, 'package.json'), JSON.stringify({ name: 'root', version: '1.0.0' }));
      await run(x, ['rebuild', 'nonexist'])
        .expect('code', 1)
        .expect('stderr', /npd-x rebuild: nonexist is not installed in /)
        .notExpect('stderr', STACK)
        .end();
      await run(helper.npminstall, ['--write', 'dev'])
        .expect('code', 1)
        .expect('stderr', /--write only accepts the --write=<type> form/)
        .notExpect('stderr', STACK)
        .end();
    });

    it('should keep the call stack of internal errors', () => {
      const mm = require('mm');
      const utils = require('../../lib/utils');
      const errors = [];
      mm(utils, 'exitAfterFlush', () => {});
      mm(console, 'error', (...args) => errors.push(args.join(' ')));
      mm(console, 'log', () => {});
      try {
        utils.exitWithError('npd', new TypeError('boom'));
        utils.exitWithError('npd', utils.userError('bad input'));
      } finally {
        mm.restore();
      }
      assert.match(errors[0], /TypeError: boom/);
      assert.match(errors[0], STACK);
      assert.match(errors[3], /bad input/);
      assert.doesNotMatch(errors[3], STACK);
    });
  });

  describe('without package.json', () => {
    it('should fail and write nothing', async () => {
      await run(x, ['install', '--offline'])
        .expect('code', 1)
        .expect('stderr', /no package\.json in .+, run npd-x inside a project folder or name the packages to install/)
        .notExpect('stderr', STACK)
        .end();
      await run(helper.npminstall, ['--offline'])
        .expect('code', 1)
        .expect('stderr', /no package\.json in /)
        .end();
      assert.deepEqual(await fs.readdir(tmp), []);
    });
  });

  describe('--version', () => {
    it('should print the name of the entry', async () => {
      await run(x, ['--version'])
        .expect('code', 0)
        .expect('stdout', /^npd-x v\d+\.\d+\.\d+/)
        .end();
      await run(x, ['install', '-v'])
        .expect('code', 0)
        .expect('stdout', /^npd-x v\d+\.\d+\.\d+/)
        .end();
      await run(x, ['update', '-v'])
        .expect('code', 0)
        .expect('stdout', /^npd-x v\d+\.\d+\.\d+/)
        .end();
      await run(helper.npminstall, ['--version'])
        .expect('code', 0)
        .expect('stdout', /^npd v\d+\.\d+\.\d+/)
        .end();
    });
  });
});
