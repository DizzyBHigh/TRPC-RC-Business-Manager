/* 

5 - MINUTE SETUP GUIDE

1. Create Firebase project(free)
Go to: https://firebase.google.com
→ “Create project” → name it “HSRP - Manager” → disable Google Analytics → Create

2. Add Firestore Database
In Firebase console → Build → Firestore Database
Click “Create database”
Start in test mode(we’ll secure it in 1 minute)

Choose closest region(e.g.nam5(us - central))

3. Add Web App
Click Project Overview (Left side of the screen at the top )

Underneath your Project Name (HSRP -Business Manager)
Click the web icon </> → App nickname: “HSRP Manager” → Register app
Copy the config(looks like this):

const firebaseConfig = {
    apiKey: "AIzaSy...",
    authDomain: "hsrp-manager-123.firebaseapp.com",
    projectId: "hsrp-manager-123",
    storageBucket: "hsrp-manager-123.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc123def456"
};

Paste it at the bottom of this page overwriting whats already there.
Save this file as firebaseConfig.js (in the js folder)


On  the firebase console
Go to Authentication (on the left hand side of the screen underneath FireStore Database)
Select the "Sign-in method" tab

from the first colulmn choose anonymous and enable it.

Click FireStore Database (Left hand side of the screen near the top)
Click the "Rules" Tab

Copy and paste the following ruleset

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // EVERYTHING under /business is allowed for any logged-in user (including anonymous)
match /business/{businessId}/{path=**} {
  allow read, write: if request.auth != null;
}

// Deny everything else in the database
    match /{document=**} {
      allow read, write: if false;
    }
  }
}

open the index.html in your browser

*/

// HSRP BUSINESS - DEMO CREDENTIALS
const firebaseConfig = {
  apiKey: "AIzaSyAjKU_arjegefucydHp2qWFzeYMGJN891Y",
  authDomain: "ravencityrp-materialmana-c7464.firebaseapp.com",
  projectId: "ravencityrp-materialmana-c7464",
  storageBucket: "ravencityrp-materialmana-c7464.firebasestorage.app",
  messagingSenderId: "689509717654",
  appId: "1:689509717654:web:ba401bfdc9edca3d0954b7"
};

// 1) make a copy of this file
// 2) replace the above config with your own config
// 3) save as firebaseConfig.js
// 4) open index.html

