// firebaseConfig.js
// This file is safe to commit — keys come from environment variables

window.firebaseConfig = window.firebaseConfig || {
  apiKey: window.VITE_FIREBASE_API_KEY || "YOUR-LOCAL-TEST-KEY",
  authDomain: window.VITE_FIREBASE_AUTH_DOMAIN || "localhost-test.firebaseapp.com",
  projectId: window.VITE_FIREBASE_PROJECT_ID || "local-test",
  storageBucket: window.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: window.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: window.VITE_FIREBASE_APP_ID || ""
};

// Debug log (remove in production if you want)
console.log("Firebase config loaded:", {
  hasKey: !!window.firebaseConfig.apiKey,
  project: window.firebaseConfig.projectId
});
