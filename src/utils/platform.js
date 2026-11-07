'use strict';

const os = require('node:os');
const fs = require('node:fs');

function detectPlatform(overrides = {}) {
  const env = overrides.env || process.env;
  const platform = overrides.platform || process.platform;
  const arch = overrides.arch || process.arch;
  const release = overrides.release || os.release();
  const prefix = String(env.PREFIX || '');
  const termux = Boolean(env.TERMUX_VERSION || /com\.termux/i.test(prefix));
  const android = termux || Boolean(env.ANDROID_ROOT || env.ANDROID_DATA);
  const family = android ? 'android' : ({
    win32: 'windows',
    darwin: 'macos',
    linux: 'linux',
    freebsd: 'freebsd',
    openbsd: 'openbsd',
    aix: 'aix',
    sunos: 'sunos'
  }[platform] || 'unknown');

  const container = Boolean(
    env.DOCKER_CONTAINER
    || env.CONTAINER
    || env.KUBERNETES_SERVICE_HOST
    || overrides.container
    || (!overrides.skipFilesystemCheck && fs.existsSync('/.dockerenv'))
  );

  let host = 'self-hosted';
  if (env.RENDER) host = 'render';
  else if (env.DYNO) host = 'heroku';
  else if (env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID) host = 'railway';
  else if (env.FLY_APP_NAME) host = 'fly';
  else if (env.VERCEL) host = 'vercel';
  else if (env.CODESPACES) host = 'codespaces';
  else if (env.GITHUB_ACTIONS) host = 'github-actions';

  return Object.freeze({
    family,
    platform,
    arch,
    release,
    node: overrides.nodeVersion || process.versions.node,
    android,
    termux,
    container,
    host,
    isWindows: family === 'windows',
    isMacOS: family === 'macos',
    isLinux: family === 'linux',
    isAndroid: family === 'android'
  });
}

function describePlatform(info = detectPlatform()) {
  const labels = {
    android: info.termux ? 'Android (Termux)' : 'Android',
    windows: 'Windows',
    macos: 'macOS',
    linux: 'Linux',
    freebsd: 'FreeBSD',
    openbsd: 'OpenBSD',
    aix: 'AIX',
    sunos: 'Solaris',
    unknown: 'Sistema não identificado'
  };
  return `${labels[info.family] || labels.unknown} | ${info.arch} | Node ${info.node} | host: ${info.host}${info.container ? ' | container: sim' : ''}`;
}

module.exports = { detectPlatform, describePlatform };
