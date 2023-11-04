import { chromium } from 'playwright-chromium';
import { cfg } from './config.js';

// json database
import { JSONPreset } from 'lowdb/node';
const db = await JSONPreset('data/db.json', {});
// TODO write how many points were claimed and when

// using puppeteer-extra-plugin-stealth only led to error "Couldn't sign you in - This browser or app may not be secure" on google login
// using https://github.com/apify/fingerprint-suite worked, but has no launchPersistentContext...
// from https://github.com/apify/fingerprint-suite/issues/162
import { FingerprintInjector } from 'fingerprint-injector';
import { FingerprintGenerator } from 'fingerprint-generator';

const { fingerprint, headers } = new FingerprintGenerator().getFingerprint({
    // devices: ["mobile"],
    // operatingSystems: ["android"],
});

const context = await chromium.launchPersistentContext(cfg.dir.browser, {
    headless: cfg.headless,
    userAgent: fingerprint.navigator.userAgent,
    viewport: {
        width: fingerprint.screen.width,
        height: fingerprint.screen.height,
    },
    extraHTTPHeaders: {
        'accept-language': headers['accept-language'],
    },
    args: [ // https://peter.sh/experiments/chromium-command-line-switches
      '--hide-crash-restore-bubble',
    ],
});

await new FingerprintInjector().attachFingerprintToPlaywright(context, { fingerprint, headers });


if (!cfg.debug) context.setDefaultTimeout(cfg.timeout);

try {
  const page = context.pages().length ? context.pages()[0] : await context.newPage(); // should always exist
  await page.goto('https://play.google.com/store/points/perks');

  await Promise.any([page.waitForURL(/.*accounts.google.com.*/).then(async () => {
    console.error('Not logged in! Will wait for 120s...');
    await page.waitForTimeout(120*1000);
  }), page.locator('h2:has-text("Weekly prize")').waitFor()]);

  const claim_btn = page.locator('span:text-is("Claim")');

  if (await claim_btn.count()) {
    await claim_btn.click();
  } else {
    console.log('Play points already claimed for this week!');
    console.log('Next points:', await page.locator('div:has-text("Available on")').last().innerText());
  }

} catch (error) {
  console.error(error); // .toString()?
  process.exitCode ||= 1;
} finally {
  await db.write(); // write out json db
  await context.close();
}
