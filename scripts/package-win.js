const { packager } = require('@electron/packager');
const fs = require('node:fs');
const path = require('node:path');

async function build() {
const { default: pngToIco } = await import('png-to-ico');
const iconPath = path.join(__dirname, '..', 'assets', 'yuexin.ico');
fs.writeFileSync(iconPath, await pngToIco(path.join(__dirname, '..', 'assets', 'yuexin-idle.png')));
return packager({
  dir: '.',
  name: '月薪喵',
  platform: 'win32',
  arch: 'x64',
  electronZipDir: process.env.ELECTRON_ZIP_DIR || undefined,
  out: 'dist',
  overwrite: true,
  asar: true,
  prune: true,
  icon: iconPath,
  ignore: [
    /^\/\.git($|\/)/,
    /^\/\.npm-cache($|\/)/,
    /^\/dist($|\/)/,
    /^\/backups($|\/)/,
    /^\/\.tools($|\/)/,
    /^\/test($|\/)/,
    /^\/scripts($|\/)/,
  ],
  win32metadata: { CompanyName: '月薪喵', FileDescription: '月薪喵桌面宠物', ProductName: '月薪喵' },
});
}

build().then((paths) => paths.forEach((path) => console.log(path))).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
