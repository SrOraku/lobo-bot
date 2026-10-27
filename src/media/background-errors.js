'use strict';

// Only these identifiers may cross the worker boundary. Raw native-library
// errors can include host paths and must never become WhatsApp messages.
const BACKGROUND_ERROR_CODES = Object.freeze([
  'BACKGROUND_DEPENDENCY_MISSING',
  'BACKGROUND_ASSET_MISSING',
  'BACKGROUND_NATIVE_UNAVAILABLE',
  'BACKGROUND_MEMORY',
  'BACKGROUND_PERMISSION',
  'BACKGROUND_DISK_FULL',
  'BACKGROUND_INVALID_IMAGE',
  'BACKGROUND_MODEL_FAILED',
  'BACKGROUND_INFERENCE_FAILED',
  'BACKGROUND_FAILED',
]);

function classifyBackgroundError(error, stage) {
  const code = error?.code;
  const message = String(error?.message || '');
  if (BACKGROUND_ERROR_CODES.includes(code)) return code;
  if (['EACCES', 'EPERM'].includes(code)) return 'BACKGROUND_PERMISSION';
  if (['ENOSPC', 'EDQUOT'].includes(code)) return 'BACKGROUND_DISK_FULL';
  if (code === 'ENOMEM' || /out of memory|std::bad_alloc|bad allocation|cannot allocate memory|failed to allocate/i.test(message))
    return 'BACKGROUND_MEMORY';
  if (code === 'ERR_DLOPEN_FAILED' || /onnxruntime_binding\.node|invalid ELF|GLIBC_|GLIBCXX_|undefined symbol|Could not load the .?sharp.? module|wrong ELF class|unsupported (?:platform|architecture)/i.test(message))
    return 'BACKGROUND_NATIVE_UNAVAILABLE';
  if (code === 'MODULE_NOT_FOUND') return 'BACKGROUND_DEPENDENCY_MISSING';
  if (stage === 'ASSETS') return 'BACKGROUND_ASSET_MISSING';
  if (/unsupported image|image.*(?:corrupt|invalid)|Input (?:buffer|file).*unsupported|VipsJpeg|pngload.*error|Invalid input/i.test(message))
    return 'BACKGROUND_INVALID_IMAGE';
  if (stage === 'INPUT') return 'BACKGROUND_INVALID_IMAGE';
  if (stage === 'MODEL') return 'BACKGROUND_MODEL_FAILED';
  if (stage === 'INFERENCE') return 'BACKGROUND_INFERENCE_FAILED';
  return 'BACKGROUND_FAILED';
}

module.exports = { BACKGROUND_ERROR_CODES, classifyBackgroundError };
