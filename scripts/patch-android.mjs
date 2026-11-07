import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('android/app/src/main/java');
if (!fs.existsSync(root)) {
  console.error('Android MainActivity not found. Run this script after cap add android.');
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

const file = findMainActivity(root);
if (!file) {
  console.error('Expected Capacitor MainActivity.java was not generated.');
  process.exit(1);
}

let source = fs.readFileSync(file, 'utf8');
const statement = 'CookieManager.getInstance().setAcceptThirdPartyCookies(getBridge().getWebView(), true);';
if (source.includes(statement)) {
  console.log('Third-party cookies are already enabled.');
  process.exit(0);
}
if (!source.includes('extends BridgeActivity')) {
  console.error('Unexpected MainActivity template; refusing to modify it automatically.');
  process.exit(1);
}
if (!source.includes('import com.getcapacitor.BridgeActivity;')) {
  console.error('BridgeActivity import was not found; refusing to modify the generated file.');
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
console.log('Enabled third-party WebView cookies for the existing HttpOnly login session.');
