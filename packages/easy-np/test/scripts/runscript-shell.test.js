const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs/promises');
const coffee = require('coffee');
const helper = require('../support/helper');

// 安装脚本整条交给 shell 执行: 引号内的连续空格原样保留, Node 24+ 不报 DEP0190
describe('test/scripts/runscript-shell.test.js', () => {
  const [tmp, cleanup] = helper.tmp();
  const [cache, cleanupCache] = helper.tmp();

  beforeEach(async () => {
    await cleanup();
    await cleanupCache();
  });
  afterEach(async () => {
    await cleanup();
    await cleanupCache();
  });

  it('should keep quoted spaces of lifecycle scripts', async function () {
    if (process.platform === 'win32') this.skip();
    const write = `require('fs').writeFileSync('out.txt', process.argv[1])`;
    await fs.writeFile(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'root', version: '1.0.0', scripts: { postinstall: `node -e "${write}" '[a    b]'` } })
    );
    // --offline: 没有依赖, 不需要网络
    await coffee
      .fork(helper.npminstall, ['--offline'], {
        cwd: tmp,
        env: { ...process.env, np_cache: cache, npm_config_cache: cache },
      })
      .expect('code', 0)
      .notExpect('stderr', /DEP0190/)
      .notExpect('stderr', /DeprecationWarning/)
      .end();
    assert.equal(await fs.readFile(path.join(tmp, 'out.txt'), 'utf8'), '[a    b]');
  });
});
