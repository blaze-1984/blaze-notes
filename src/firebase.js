import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBoHvPes9GdToB4PK8-V2nsipmJrJy-GG4",
  authDomain: "my-first-firebase-projec-486b3.firebaseapp.com",
  projectId: "my-first-firebase-projec-486b3",
  storageBucket: "my-first-firebase-projec-486b3.firebasestorage.app",
  messagingSenderId: "621482567660",
  appId: "1:621482567660:web:f1c1a9e5f1117f73ee42c9"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);