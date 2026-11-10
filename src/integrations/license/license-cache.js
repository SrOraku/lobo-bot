'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function createLicenseCache(options = {}) {
  const filePath = options.filePath || process.env.LICENSE_CACHE_FILE || path.join(process.cwd(), 'data', 'license-cache.json');
  const maxAgeMs = Number(options.maxAgeMs || process.env.LICENSE_CACHE_MAX_AGE_MS || 6 * 60 * 60 * 1000);
  const secret = options.secret || process.env.LICENSE_CACHE_SECRET || '';

  function signature(record) {
    return crypto.createHmac('sha256', secret).update(JSON.stringify({
      valid: record.valid, status: record.status, checkedAt: record.checkedAt, expiresAt: record.expiresAt || null,
    })).digest('hex');
  }

  function read() {
    if (!secret) return null;
    try {
      const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const expected = signature(record);
      const a = Buffer.from(record.signature || '', 'hex');
      const b = Buffer.from(expected, 'hex');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
      const checked = Date.parse(record.checkedAt);
      if (!Number.isFinite(checked) || Date.now() - checked > maxAgeMs || checked > Date.now() + 60000) return null;
      if (record.valid !== true || !['active', 'trial'].includes(record.status)) return null;
      if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) return null;
      return { valid: true, status: record.status, checkedAt: record.checkedAt, expiresAt: record.expiresAt || null, cached: true };
    } catch { return null; }
  }

  function write(result) {
    if (!secret || result?.valid !== true || !['active', 'trial'].includes(result.status)) return false;
    const record = { valid: true, status: result.status, checkedAt: result.checkedAt || new Date().toISOString(), expiresAt: result.expiresAt || null };
    record.signature = signature(record);
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(record), { mode: 0o600 });
    fs.renameSync(tmp, filePath);
    return true;
  }

  return { read, write };
}

module.exports = { createLicenseCache };
