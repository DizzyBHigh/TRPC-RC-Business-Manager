// firebaseConfig.js
// This file is safe to commit — real keys are injected by Amplify at deploy time

window.firebaseConfig = window.firebaseConfig || {
  apiKey: window.FIREBASE_API_KEY || null,
  authDomain: window.FIREBASE_AUTH_DOMAIN || null,
  projectId: window.FIREBASE_PROJECT_ID || null,
  storageBucket: window.FIREBASE_STORAGE_BUCKET || null,
  messagingSenderId: window.FIREBASE_MESSAGING_SENDER_ID || null,
  appId: window.FIREBASE_APP_ID || null
};

console.log("Firebase config loaded from Amplify env:", {
  hasKey: !!window.firebaseConfig.apiKey,
  project: window.firebaseConfig.projectId || "MISSING"
});

if (!window.firebaseConfig.apiKey) {
  console.error("Firebase keys not injected — check Amplify env vars");
}
