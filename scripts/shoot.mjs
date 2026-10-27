/* Look-and-fix loop: render the running dev server to PNGs in renders/ (gitignored).
   Usage: node scripts/shoot.mjs [baseUrl] */
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const base = process.argv[2] || 'http://localhost:5173';
const out = join(process.cwd(), 'renders');
mkdirSync(out, { recursive: true });

const { default: chromium, inflate, setupLambdaEnvironment } = await import('@sparticuz/chromium');
const packageEntry = require.resolve('@sparticuz/chromium');
const binDirectory = join(dirname(packageEntry), '..', 'bin');
await inflate(join(binDirectory, 'al2023.tar.br'));
setupLambdaEnvironment(join(tmpdir(), 'al2023', 'lib'));

const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args, '--no-sandbox'],
  headless: true,
});

const shots = [
  { name: 'desktop-hero', width: 1440, height: 900, scroll: 0 },
  { name: 'desktop-story-early', width: 1440, height: 900, fraction: 0.16 },
  { name: 'desktop-story-mid', width: 1440, height: 900, fraction: 0.34 },
  { name: 'desktop-story-late', width: 1440, height: 900, fraction: 0.52 },
  { name: 'desktop-forms', width: 1440, height: 900, selector: '#forms' },
  { name: 'desktop-impact', width: 1440, height: 900, selector: '#impact' },
  { name: 'desktop-footer', width: 1440, height: 900, fraction: 1 },
  { name: 'mobile-hero', width: 390, height: 844, scroll: 0 },
  { name: 'mobile-story', width: 390, height: 844, fraction: 0.3 },
];

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.goto(base, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((resolve) => setTimeout(resolve, 2600));

for (const shot of shots) {
  await page.setViewport({ width: shot.width, height: shot.height, deviceScaleFactor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 500));
  await page.evaluate(async (spec) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    let y = 0;
    if (spec.selector) {
      y = document.querySelector(spec.selector).getBoundingClientRect().top + window.scrollY - 70;
    } else if (spec.fraction !== undefined) {
      y = max * spec.fraction;
    }
    window.scrollTo({ top: y, behavior: 'instant' });
    await new Promise((resolve) => setTimeout(resolve, 900));
  }, shot);
  await new Promise((resolve) => setTimeout(resolve, 700));
  await page.screenshot({ path: join(out, `${shot.name}.png`) });
  console.log('shot', shot.name);
}

await browser.close();
console.log('DONE');
