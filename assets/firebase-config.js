export const firebaseConfig = {
  apiKey: "AIzaSyDgPYK0iJS_T_V46mFrLLhjj-blJ3QRBA4",
  authDomain: "practicum-tracker-de9e7.firebaseapp.com",
  projectId: "practicum-tracker-de9e7",
  storageBucket: "practicum-tracker-de9e7.firebasestorage.app",
  messagingSenderId: "200061115214",
  appId: "1:200061115214:web:22780768b8287bbb2adc1f",
  measurementId: "G-3RQ5LWTC83"
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  value => value && !value.startsWith("PASTE_")
);
