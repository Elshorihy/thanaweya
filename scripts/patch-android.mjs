import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const androidRes = path.resolve('android/app/src/main/res');
const sourceIcon = path.resolve('public/icons/thanaweya-palestine-192.jpg');
if (!fs.existsSync(androidRes)) {
  console.error('Android resources not found. Run this script after cap add android.');
  process.exit(1);
}
if (!fs.existsSync(sourceIcon)) {
  console.error('The colorful Thanaweya logo was not found at ' + sourceIcon);
  process.exit(1);
}

const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [density, size] of Object.entries(densities)) {
  const dir = path.join(androidRes, 'mipmap-' + density);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ['ic_launcher', 'ic_launcher_round']) {
    execFileSync('convert', [
      sourceIcon, '-resize', size + 'x' + size + '^',
      '-gravity', 'center', '-extent', size + 'x' + size,
      '-strip', path.join(dir, name + '.png')
    ]);
  }
}

const adaptiveDir = path.join(androidRes, 'mipmap-anydpi-v26');
fs.mkdirSync(adaptiveDir, { recursive: true });
const adaptiveXml = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">',
  '    <background android:drawable="@android:color/white"/>',
  '    <foreground android:drawable="@mipmap/ic_launcher"/>',
  '</adaptive-icon>',
  ''
].join('\n');
for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  fs.writeFileSync(path.join(adaptiveDir, name), adaptiveXml);
}
console.log('Generated full-color Thanaweya launcher icons for all Android densities.');

const javaRoot = path.resolve('android/app/src/main/java');
if (!fs.existsSync(javaRoot)) {
  console.error('Android MainActivity source not found.');
  process.exit(1);
}
function findMainActivity(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findMainActivity(full);
      if (found) return found;
    } else if (entry.name === 'MainActivity.java') {
      return full;
    }
  }
  return null;
}
const file = findMainActivity(javaRoot);
if (!file) {
  console.error('Expected Capacitor MainActivity.java was not generated.');
  process.exit(1);
}
let source = fs.readFileSync(file, 'utf8');
const statement = 'CookieManager.getInstance().setAcceptThirdPartyCookies(getBridge().getWebView(), true);';
if (!source.includes(statement)) {
  if (!source.includes('extends BridgeActivity') || !source.includes('import com.getcapacitor.BridgeActivity;')) {
    console.error('Unexpected MainActivity template; refusing to modify it automatically.');
    process.exit(1);
  }
  source = source.replace(
    'import com.getcapacitor.BridgeActivity;',
    'import com.getcapacitor.BridgeActivity;\nimport android.os.Bundle;\nimport android.webkit.CookieManager;'
  );
  source = source.replace(
    /public class MainActivity extends BridgeActivity\s*\{\s*\}/,
    'public class MainActivity extends BridgeActivity {\n' +
    '    @Override\n' +
    '    public void onCreate(Bundle savedInstanceState) {\n' +
    '        super.onCreate(savedInstanceState);\n' +
    '        ' + statement + '\n' +
    '    }\n' +
    '}'
  );
  if (!source.includes(statement)) {
    console.error('Could not safely patch MainActivity; no file changes were written.');
    process.exit(1);
  }
  fs.writeFileSync(file, source);
}
console.log('Third-party WebView cookies are enabled for the existing HttpOnly login session.');
