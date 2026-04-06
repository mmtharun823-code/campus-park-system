// firebase-config.js
// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCsgh1Ec9mNg1_9KJMpN_iZ4mxxaK0Q37M",
  authDomain: "smartparking-fa1d7.firebaseapp.com",
  projectId: "smartparking-fa1d7",
  storageBucket: "smartparking-fa1d7.firebasestorage.app",
  messagingSenderId: "727898170729",
  appId: "1:727898170729:web:5c983b44f309dabd4c49f8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Firebase services
export const auth = getAuth(app);
export const db   = getFirestore(app);
