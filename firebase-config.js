(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PirateFirebaseConfig = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const PRODUCTION_PROJECT_ID = 'tracker-progress-2b682';
  const PRODUCTION_CONFIG = Object.freeze({
    apiKey: 'AIzaSyCEsm7Ohot2I4IBCO1_XtJNS3aB3l0jpEw',
    authDomain: 'tracker-progress-2b682.firebaseapp.com',
    projectId: PRODUCTION_PROJECT_ID,
    storageBucket: 'tracker-progress-2b682.firebasestorage.app',
    messagingSenderId: '468722862029',
    appId: '1:468722862029:web:0197f0ec8e99e66ec2a684'
  });
  const EMULATOR_CONFIG = Object.freeze({
    apiKey: 'demo-api-key',
    authDomain: 'demo-pirate-auth.firebaseapp.com',
    projectId: 'demo-pirate-auth',
    appId: 'demo-pirate-auth'
  });

  function forLocation(locationLike) {
    const hostname = String(locationLike?.hostname || '');
    const params = new URLSearchParams(String(locationLike?.search || ''));
    const useEmulators = ['localhost', '127.0.0.1'].includes(hostname) && params.get('emulator') === '1';
    return {
      firebase: useEmulators ? EMULATOR_CONFIG : PRODUCTION_CONFIG,
      projectId: useEmulators ? EMULATOR_CONFIG.projectId : PRODUCTION_PROJECT_ID,
      useEmulators,
      authEmulatorUrl: 'http://127.0.0.1:9099',
      firestoreEmulatorHost: '127.0.0.1',
      firestoreEmulatorPort: 8080
    };
  }

  return { PRODUCTION_CONFIG, PRODUCTION_PROJECT_ID, forLocation };
});
