import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  initializeAuth, 
  getReactNativePersistence 
} from "firebase/auth";
import { getFirestore, setLogLevel } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// ปิดการแสดง log/warning ของ Firestore บนหน้าจอ
try {
  setLogLevel('silent');
} catch (e) {}
// ฯลฯ

// --- ⬇️ ใส่ Config ของคุณตรงนี้ ⬇️ ---
const firebaseConfig = {
  apiKey: "AIzaSyBunW4pkrgwxu9xOKMV7dw4aOn09F-oC3U",
  authDomain: "chivart-25c31.firebaseapp.com",
  projectId: "chivart-25c31",
  storageBucket: "chivart-25c31.firebasestorage.app",
  messagingSenderId: "568361094715",
  appId: "1:568361094715:web:05dc0e6ab59f874b93561e",
  measurementId: "G-217RRZV46G"
};
// --- ⬆️ สิ้นสุดส่วน Config ⬆️ ---

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth พร้อมระบบจำการล็อกอินสำหรับ React Native
let authInstance;
try {
  if (Platform.OS === 'web') {
    authInstance = getAuth(app);
  } else {
    authInstance = initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    });
  }
} catch (e) {
  authInstance = getAuth(app);
}

// Export service ที่คุณจะใช้ในหน้าอื่นๆ
export const auth = authInstance;
export const db = getFirestore(app);
export const storage = getStorage(app);

// แนะนำให้ export app ไว้ด้วย เผื่อต้องใช้
export default app;