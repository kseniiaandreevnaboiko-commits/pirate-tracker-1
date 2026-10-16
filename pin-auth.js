(function () {
  'use strict';
  if (window.PinAuth) return;

  const sessionKey = 'pirateTrackerAuthSession';
  const attemptsKey = 'pirateTrackerPinAttempts';
  const encoder = new TextEncoder();

  function bytesToBase64(bytes) {
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  async function derive(pin, salt, iterations) {
    const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
    return new Uint8Array(bits);
  }

  async function createRecord(pin) {
    if (!/^\d{4}$/.test(pin)) throw new Error('PIN должен состоять из четырёх цифр');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iterations = 120000;
    const hash = await derive(pin, salt, iterations);
    return { version: 1, algorithm: 'PBKDF2-SHA256', iterations, salt: bytesToBase64(salt), hash: bytesToBase64(hash) };
  }

  async function verify(pin, record) {
    if (!/^\d{4}$/.test(pin) || !record?.salt || !record?.hash) return false;
    try {
      const expected = base64ToBytes(record.hash);
      const actual = await derive(pin, base64ToBytes(record.salt), Number(record.iterations) || 120000);
      if (actual.length !== expected.length) return false;
      let difference = 0;
      for (let index = 0; index < actual.length; index++) difference |= actual[index] ^ expected[index];
      return difference === 0;
    } catch (error) { return false; }
  }

  function createSession(role, details = {}) {
    const session = { token: crypto.randomUUID(), role, classId: details.classId || null, studentId: details.studentId || null, createdAt: Date.now() };
    sessionStorage.setItem(sessionKey, JSON.stringify(session));
    return session;
  }

  function getSession() {
    if (window.PIRATE_AUTH_TEST_MODE) return window.__pirateSecureSession || null;
    try {
      const session = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
      if (!session?.token || !['teacher', 'student'].includes(session.role)) return null;
      if (Date.now() - Number(session.createdAt || 0) > 12 * 60 * 60 * 1000) { clearSession(); return null; }
      return session;
    } catch (error) { return null; }
  }

  function clearSession() {
    if (window.PIRATE_AUTH_TEST_MODE) {
      window.__pirateSecureSession = null;
      return;
    }
    sessionStorage.removeItem(sessionKey);
  }

  function getAttempt(key) {
    try { return JSON.parse(sessionStorage.getItem(attemptsKey) || '{}')[key] || { count: 0, lockedUntil: 0 }; }
    catch (error) { return { count: 0, lockedUntil: 0 }; }
  }

  function setAttempt(key, value) {
    let attempts = {};
    try { attempts = JSON.parse(sessionStorage.getItem(attemptsKey) || '{}'); } catch (error) {}
    attempts[key] = value;
    sessionStorage.setItem(attemptsKey, JSON.stringify(attempts));
  }

  function registerFailure(key) {
    const previous = getAttempt(key);
    const count = previous.lockedUntil > Date.now() ? previous.count : previous.count + 1;
    const result = count >= 5 ? { count: 0, lockedUntil: Date.now() + 30000 } : { count, lockedUntil: 0 };
    setAttempt(key, result);
    return result;
  }

  function clearFailures(key) { setAttempt(key, { count: 0, lockedUntil: 0 }); }

  window.PinAuth = { createRecord, verify, createSession, getSession, clearSession, getAttempt, registerFailure, clearFailures };
})();
