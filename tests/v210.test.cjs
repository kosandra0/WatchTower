'use strict';
// WatchTower 2.1.0 checks against the PACKAGED server (isolated temp data directory only):
// the tray quick panel lists every sidebar page, and the faster XP curve is in effect.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers.cjs');

const present = fs.existsSync(h.packagedServerDir);
const skip = !present && process.env.WATCHTOWER_REQUIRE_PACKAGE !== '1' ? 'packaged build not found (run npm run desktop:dir)' : false;
const PAGES = ['Overview', 'Statistics', 'Applications', 'Sessions', 'Timeline', 'Focus', 'Limits', 'Productivity', 'Projects', 'Reports', 'Achievements', 'Settings'];

test('2.1.0 tray panel lists all pages; levels use the 2.25x faster curve', { skip, timeout: 300000 }, async (t) => {
  const { root, dest } = h.isolateBundle(h.packagedServerDir);
  const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir, { recursive: true });
  const port = await h.freePort();
  const srv = h.startServer(dest, dataDir, port);
  t.after(async () => { await h.stopServer(srv); await h.removeDir(root); });
  await h.waitHealthy(srv, port);
  const base = `http://127.0.0.1:${port}`;

  const html = (await h.request(`${base}/tray`)).text;
  const labels = [...html.matchAll(/<button[^>]*class="tray-link"[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<svg.*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim());
  assert.deepEqual(labels, PAGES, 'tray quick panel shows exactly the sidebar pages, in order');

  const lv = (await h.request(`${base}/api/achievements`)).json;
  const level = lv.level ?? lv.data?.level ?? lv;
  assert.equal(level.level, 1, 'fresh data starts at level 1');
  assert.equal(level.nextAt, 44, 'level 2 needs 44 XP (was 100: 2.25x faster)');
  assert.equal(level.currentFloor, 0);
});
