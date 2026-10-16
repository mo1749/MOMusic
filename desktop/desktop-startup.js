'use strict';

const fs = require('fs');
const path = require('path');

// Separate from visual archives: only confirmed user choices survive shutdown.
class DesktopStartup {
  constructor(userDataPath) {
    this.file = path.join(userDataPath, 'desktop-startup.json');
    this.config = { version: 1, restoreOnStartup: false, lastDesktopEnabled: false };
    this.consumed = false;
    this.intentVersion = 0;
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.config.restoreOnStartup = raw.restoreOnStartup === true;
      this.config.lastDesktopEnabled = raw.lastDesktopEnabled === true;
    } catch (_) { /* Missing/invalid legacy configuration keeps safe defaults. */ }
  }

  read() { return { ...this.config }; }

  save(next) {
    const temp = this.file + '.tmp-' + process.pid;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(temp, JSON.stringify(next, null, 2), 'utf8');
      fs.renameSync(temp, this.file);
      this.config = next;
    } finally {
      try { fs.unlinkSync(temp); } catch (_) {}
    }
    return this.read();
  }

  update(patch) {
    if (!patch || typeof patch.restoreOnStartup !== 'boolean') throw new Error('DESKTOP_STARTUP_INVALID_CONFIG');
    return this.save({ ...this.config, restoreOnStartup: patch.restoreOnStartup });
  }

  beginUserChange(enabled) {
    this.consumed = true;
    const version = ++this.intentVersion;
    // Escape / explicit off also cancels an enable still in flight.
    if (!enabled) this.save({ ...this.config, lastDesktopEnabled: false });
    return version;
  }

  confirmUserChange(version, enabled, result) {
    if (version === this.intentVersion && result && result.ok === true && result.enabled === enabled) {
      this.save({ ...this.config, lastDesktopEnabled: enabled });
    }
  }

  cancelPending() { this.consumed = true; this.intentVersion += 1; }

  async restore({ enable, disable, getStatus }) {
    if (this.consumed) return { ok: true, attempted: false, status: getStatus() };
    this.consumed = true; // Before awaiting: concurrent IPC calls cannot retry.
    if (!this.config.restoreOnStartup || !this.config.lastDesktopEnabled) {
      return { ok: true, attempted: false, status: getStatus() };
    }
    const version = this.intentVersion;
    try {
      const result = await enable(() => version === this.intentVersion);
      if (version !== this.intentVersion) return { ok: true, attempted: true, cancelled: true, status: getStatus() };
      if (!result || result.ok !== true || result.enabled !== true) {
        throw new Error(result && result.error || 'DESKTOP_STARTUP_RESTORE_FAILED');
      }
      return { ...result, attempted: true, status: getStatus() };
    } catch (error) {
      if (version !== this.intentVersion) return { ok: true, attempted: true, cancelled: true, status: getStatus() };
      let cleanupError = '';
      try {
        const result = await disable();
        if (result && result.ok === false) cleanupError = result.error || 'DESKTOP_STARTUP_CLEANUP_FAILED';
      } catch (failure) { cleanupError = failure.message; }
      return { ok: false, attempted: true, error: error.message, cleanupError, status: getStatus() };
    }
  }
}

module.exports = { DesktopStartup };
