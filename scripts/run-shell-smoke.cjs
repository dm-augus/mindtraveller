const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const manifest = require('../package.json');

void (async () => {
  // Launch as a package so Electron supplies the actual application's version.
  const runner = path.resolve(__dirname, '../out/smoke/runner');
  await fs.mkdir(runner, { recursive: true });
  await fs.writeFile(path.join(runner, 'package.json'), JSON.stringify({
    name: manifest.name, productName: manifest.productName, version: manifest.version,
    main: path.relative(runner, path.join(__dirname, 'shell-smoke.cjs'))
  }));
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [runner], { env: environment, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
