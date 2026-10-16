const debug = require('node:util').debuglog('np:bin');
const path = require('node:path');
const fs = require('node:fs/promises');
const chalk = require('chalk');
const cmdShim = require('@zkochan/cmd-shim');
const normalize = require('npm-normalize-package-bin');
const fixBin = require('bin-links/lib/fix-bin');
const utils = require('./utils');

module.exports = bin;
module.exports.getBinDir = getBinDir;

async function bin(parentDir, pkg, pkgDir, options, displayName = '') {
  // security fix
  // https://github.com/npm/cli/commit/19ce061a2ee165d8de862c8f0f733c222846b9e1#diff-b05945a9118978f01ad9162683e74404
  normalize(pkg);
  let bins = pkg.bin || {};
  if (typeof bins === 'string') {
    bins = {};
    bins[pkg.name] = pkg.bin;
  }

  const names = Object.keys(bins);
  if (names.length === 0) {
    return;
  }
  displayName = displayName || `${pkg.name}@${pkg.version}`;
  // root package link to options.binDir first
  const binDir = getBinDir(parentDir, options);
  const showBinLog = binDir === options.binDir;
  await utils.mkdirp(binDir);

  for (const name of names) {
    const srcBin = path.join(pkgDir, bins[name]);
    const destBin = path.join(binDir, name);
    if (!(await utils.exists(srcBin))) {
      options.pendingMessages.push([
        'warn',
        '%s %s %s',
        chalk.yellow('WARN'),
        chalk.gray(displayName),
        `Failed to create bin at '${destBin}', the source file '${srcBin}' does not exist`,
      ]);
      continue;
    }
    // add NODE_PATH on shim bin
    // pkgDir: node_modules/.store/<name>@<version>/node_modules/<name>
    const nodePath = utils.relative(path.join(pkgDir, '..'), destBin);
    await linkBin(srcBin, destBin, `$basedir/${nodePath}`);
    // hotfix $basedir to %~dp0 on cmd
    const destBinCmd = `${destBin}.cmd`;
    if (await utils.exists(destBinCmd)) {
      const content = await fs.readFile(destBinCmd, 'utf-8');
      await fs.writeFile(destBinCmd, content.replace(/\$basedir/g, '%~dp0'));
    }
    // ensure that bin are executable and not containing
    // windows line-endings(CRLF) on the hashbang line
    await fixBin(srcBin, 0o755);
    if (showBinLog) {
      options.console.info('[%s] link %s@ -> %s', chalk.green(displayName), chalk.magenta(destBin), srcBin);
    } else {
      debug('[%s@%s] link %s@ -> %s', pkg.name, pkg.version, destBin, srcBin);
    }
  }
}

async function linkBin(src, dest, nodePath) {
  // .cmd 与 .ps1 只在 Windows 上有用, 其他平台只生成 sh shim
  const isWindows = process.platform === 'win32';
  await cmdShim.ifExists(src, dest, {
    nodePath,
    createCmdFile: isWindows,
    createPwshFile: isWindows,
  });
  if (!isWindows) await execReplacedEntry(src, dest);
}

const NODE_SHIM_START = 'if [ -x "$basedir/node" ]; then\n';

// shim 按生成时入口的 shebang 写死用 node 执行; esbuild 等包的 postinstall 随后把入口换成原生程序或 shell 脚本,
// node 再执行它就报 SyntaxError. npm 在 Unix 上用 symlink, 由内核按入口当前的内容执行.
// 这里让 shim 运行时先读入口首行, 不再是 node 的 shebang 时直接执行入口, 否则照旧用 node(优先 .bin 下的 node)
async function execReplacedEntry(src, dest) {
  let shim;
  try {
    shim = await fs.readFile(dest, 'utf8');
  } catch {
    return;
  }
  const start = shim.indexOf(NODE_SHIM_START);
  if (start === -1) return;
  // 只处理入口带 node shebang 的情况; 没有 shebang 的 .js 只能用 node 执行
  if (!/^#!.*\bnode\b/.test(await firstLine(src))) return;
  const relative = path.relative(path.dirname(dest), src).split(path.sep).join('/');
  const target = path.isAbsolute(relative) ? `"${relative}"` : `"$basedir/${relative}"`;
  const check = [
    'np_entry_line=',
    `IFS= read -r np_entry_line < ${target} 2>/dev/null`,
    'case "$np_entry_line" in',
    "  '#!'*node*) ;;",
    `  *) exec ${target} "$@" ;;`,
    'esac',
    '',
  ].join('\n');
  await fs.writeFile(dest, shim.slice(0, start) + check + shim.slice(start));
}

async function firstLine(file) {
  const handle = await fs.open(file, 'r');
  try {
    const buf = Buffer.alloc(256);
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    return buf.toString('utf8', 0, bytesRead).split('\n')[0];
  } finally {
    await handle.close();
  }
}

// 根包的 bin 链接到 options.binDir, 其余链接到所在目录的 node_modules/.bin
function getBinDir(parentDir, options) {
  if (options.binDir && parentDir === options.targetDir) return options.binDir;
  return path.join(parentDir, 'node_modules', '.bin');
}
