// ============================================================
// Vercel serverless function entry point.
//
// Vercel ONLY auto-detects serverless functions inside the /api
// directory (root-level files such as /server.js are NOT deployed
// as functions). This file re-exports the real Express backend
// from server.js so Vercel deploys it as a proper function that
// serves /api/* and /uploads/* routes.
// ============================================================
import app from '../server.js';

export default app;
