const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:5173';
const DEMO = process.argv[3] === 'demo';
let fails = 0;
const ok = (l, c, x = '') => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1300, height: 850 }, acceptDownloads: true }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto(URL);
  const send = async (t) => { await p.getByLabel('Message', { exact: true }).fill(t); await p.keyboard.press('Enter'); await p.getByRole('button', { name: 'Send message' }).waitFor({ timeout: 20000 }); };
  const users = () => p.locator('.user-bubble').allInnerTexts();
  const replies = () => p.locator('.prose[aria-label="Assistant message"]').allInnerTexts();

  await p.getByText('How can I help you today').waitFor();
  ok('welcome screen shown', true);
  ok('demo banner ' + (DEMO ? 'present' : 'absent'), (await p.locator('.demo-banner').count()) === (DEMO ? 1 : 0));

  const sw0 = p.getByRole('switch'); if ((await sw0.getAttribute('aria-checked')) === 'true') await sw0.click();
  await send('hello');
  ok('1 reply streamed', (await replies()).length === 1 && (await replies())[0].length > 5);
  ok('1 title in sidebar', (await p.locator('.conv-item').first().innerText()) === 'hello');

  await p.getByRole('button', { name: 'Regenerate response' }).click();
  await p.getByRole('button', { name: 'Send message' }).waitFor();
  ok('2 regenerate keeps one user message', (await users()).length === 1 && (await replies()).length === 1);

  await p.reload(); await p.locator('.user-bubble').waitFor();
  ok('3 refresh restores chat', (await users()).join() === 'hello' && (await replies()).length === 1);
  await p.getByRole('button', { name: 'Regenerate response' }).click();
  await p.getByRole('button', { name: 'Send message' }).waitFor();
  ok('3 regenerate works after refresh (client_id exposed)', (await users()).length === 1 && (await replies()).length === 1);

  const [dl] = await Promise.all([p.waitForEvent('download'), (async () => { await p.getByRole('button', { name: /more/i }).click(); await p.getByRole('menuitem', { name: /export/i }).click(); })()]);
  ok('4 export downloads .md', dl.suggestedFilename().endsWith('.md'), dl.suggestedFilename());

  await p.keyboard.press('Control+b'); await p.waitForTimeout(300);
  ok('5 Ctrl+B collapses sidebar', await p.locator('.shell.sidebar-collapsed').count() === 1);
  await p.keyboard.press('Control+b');
  await p.getByRole('button', { name: 'About' }).first().click().catch(async () => { await p.getByRole('button', { name: /more/i }).click(); await p.getByRole('menuitem', { name: /about/i }).click(); });
  ok('6 About dialog opens', await p.getByRole('dialog').count() === 1);
  await p.keyboard.press('Escape');
  ok('6 Escape closes it', await p.getByRole('dialog').count() === 0);

  await p.getByLabel('Search chats').fill('zzz-nothing');
  ok('7 search filters list', (await p.locator('.conv-item').count()) === 0);
  await p.getByLabel('Search chats').fill('');

  await p.getByRole('button', { name: 'New chat' }).first().click();
  const sw = p.getByRole('switch'); if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click();
  await send(DEMO ? 'How does RAG cite sources?' : 'what do cats do all day');
  const chips = await p.locator('.source-chip').count();
  ok('8 documents on -> source chip shown (seed/uploaded docs)', chips > 0 || !DEMO === true, 'chips=' + chips);
  if (chips) { await p.locator('.source-chip').first().click(); ok('8 chip opens source panel', await p.locator('.source-detail').count() === 1); }

  if (DEMO) {
    await send('show me markdown');
    ok('9 demo markdown: code block + table', (await p.locator('pre').count()) > 0 && (await p.locator('table').count()) > 0);
    await p.getByRole('button', { name: /reset demo/i }).click(); await p.waitForLoadState();
    await p.getByText('How can I help you today').waitFor();
    ok('10 reset demo clears chats', (await p.locator('.conv-item').count()) === 0);
  }
  ok('no page errors', errs.length === 0, JSON.stringify(errs));
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  await b.close();
})();
