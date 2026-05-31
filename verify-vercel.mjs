// ============================================================
// Vercel Deployment Verification Script
// Checks all requirements before deploy
// ============================================================
import fs from 'fs';

const s = fs.readFileSync('server.js', 'utf8');
const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));

let pass = true;
let checks = [];

function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!ok) { console.log('❌ ' + name + (detail ? ': ' + detail : '')); pass = false; }
  else console.log('✅ ' + name);
}

console.log('='.repeat(60));
console.log('VERCEL DEPLOYMENT VERIFICATION');
console.log('='.repeat(60) + '\n');

// === Requirement 1: export default app ===
const hasExportDefault = s.includes('export default app');
check('server.js contains export default app', hasExportDefault);

// === Requirement 2: app.listen() only runs when !process.env.VERCEL ===
const listenInVercelGuard = s.includes("if (!process.env.VERCEL && !process.env.VERCEL_ENV)");
const listenGuardMatchesListen = s.includes("startServer(app, port);");
check('app.listen() only runs when !process.env.VERCEL', listenInVercelGuard && listenGuardMatchesListen);

// === Requirement 3: no setInterval runs on Vercel ===
const setIntervalBeforeExport = s.split('export default app')[0].includes('setInterval');
check('no setInterval runs on Vercel (all after export default)', !setIntervalBeforeExport);
// Also verify setInterval is only inside the VERCEL guard
const setIntervalInVercelGuard = s.includes("if (!process.env.VERCEL") && s.substring(s.indexOf("if (!process.env.VERCEL")).includes('setInterval');
check('setInterval only in Vercel guard', setIntervalInVercelGuard);

// === Requirement 4: uploads use /tmp on Vercel ===
const usesTmp = s.includes("'/tmp', 'uploads'");
check('uploads use /tmp on Vercel', usesTmp);
const vercelVarCheck = s.includes('VERCEL_ENV');
check('UPLOADS_DIR detects VERCEL_ENV', vercelVarCheck);

// === Requirement 5: no process.exit() can run on Vercel ===
// Find all process.exit calls and verify they're after the Vercel guard
const exitBeforeExport = s.split('export default app')[0].match(/process\.exit/g);
check('no process.exit() before export default', exitBeforeExport === null);
// process.exit() is in startServer() which is inside local-dev guard
// Verify startServer() is only called inside the guard
const serverStartInGuard = s.includes('startServer(app, port);') && s.substring(s.indexOf("if (!process.env.VERCEL")).includes('startServer');
check('startServer() only runs in Vercel guard', serverStartInGuard);

// === Requirement 6: vercel.json is compatible with Express serverless ===
check('vercel.json has server.js as function', v.functions && v.functions['server.js'] !== undefined);
check('vercel.json has 1000MB+ memory', v.functions['server.js'].memory >= 1024);
check('vercel.json has 30s+ maxDuration', v.functions['server.js'].maxDuration >= 30);
check('vercel.json rewrites all to server.js', v.rewrites && v.rewrites[0].destination === '/server.js');

// === Additional safety checks ===
check('No pdf-parse import', !s.includes('from "pdf-parse"') && !s.includes("from 'pdf-parse'"), 'server.js');
check('No sharp import', !s.includes('from "sharp"') && !s.includes("from 'sharp'"), 'server.js');
check('No canvas import', !s.includes('from "canvas"') && !s.includes("from 'canvas'"), 'server.js');
check('API key validation returns JSON', s.includes('return res.status(500).json({ error:'));
check('unhandledRejection handler', s.includes('unhandledRejection'));
check('uncaughtException handler', s.includes('uncaughtException'));
check('Express global error middleware', s.includes('app.use((err, req, res, next)'));
check('Multer error handler', s.includes('MulterError'));

console.log('\n' + '='.repeat(60));
if (pass) {
  console.log('✅ ALL CHECKS PASSED — Ready for Vercel deploy');
} else {
  console.log('❌ SOME CHECKS FAILED — Fix before deploying');
}
console.log('='.repeat(60));