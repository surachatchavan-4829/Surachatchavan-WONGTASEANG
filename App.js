import './alertPolyfill';
import React, { useState, useEffect } from 'react';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebaseConfig';

// ปิดการแสดงผลแจ้งเตือน Warning/Log ที่ไม่จำเป็นบนหน้าจอแอปพลิเคชัน
LogBox.ignoreAllLogs(true);
LogBox.ignoreLogs([
  'SafeAreaView has been deprecated',
  '@firebase',
  'Firestore',
]);

// ===== หมวดหมู่หน้าจอ Authentication (สำหรับผู้ใช้ที่ยังไม่ได้ล็อกอิน) =====
import FScreen from './screens/FScreen';             // หน้า Landing Page ต้อนรับแรกสุด
import LoginScreen from './screens/LoginScreen';       // หน้าจอเข้าสู่ระบบ
import SignupScreen from './screens/SignupScreen';     // หน้าจอสมัครสมาชิก

// ===== หมวดหมู่หน้าจอหลักของแอปพลิเคชัน (สำหรับผู้ใช้ที่ล็อกอินแล้ว) =====
import HomeScreen from './screens/HomeScreen';         // หน้ารวมรายวิชา (แดชบอร์ดหลัก)
import SubjectScreen from './screens/SubjectScreen';   // หน้าจัดการวิชา (ตรวจคำตอบ / ตรวจกระดาษสอบ)
import ScanScreen from './screens/ScanScreen';         // หน้าถ่ายภาพ/สแกนกระดาษคำตอบ OMR ด้วยกล้องหรือรูปภาพ
import OMRScreen from './screens/OMRScreen';           // หน้ารวมประวัติการสแกนกระดาษสอบ
import AnswerKeyScreen from './screens/AnswerKeyScreen'; // หน้าจัดการเฉลยข้อสอบ (เลือก/ลบ/บันทึกเฉลย)
import ScoreScreen from './screens/ScoreScreen';       // หน้ารายงานคะแนนและสถิตินักเรียน
import AddScreen from './screens/AddScreen';           // หน้าสร้างหรือแก้ไขรายวิชา
import SettingScreen from './screens/SettingScreen';   // หน้าตั้งค่าโปรไฟล์และ URL ของ FastAPI Server

// สร้าง Stack Navigator สำหรับจัดการเปลี่ยนหน้าจอแบบ Stack
const Stack = createNativeStackNavigator();

/**
 * App: คอมโพเนนต์หลักของระบบ (Root Component)
 * - ตรวจสอบสถานะการล็อกอินของผู้ใช้ผ่าน Firebase Authentication แบบ Realtime
 * - หากผู้ใช้ล็อกอินแล้ว: แสดงหน้าจอระบบหลัก (Home, Subject, Scan, AnswerKey, Score, ฯลฯ)
 * - หากยังไม่ได้ล็อกอิน: แสดงหน้าจอต้อนรับและหน้าล็อกอิน (FScreen, Login, Signup)
 */
export default function App() {
  // สถานะกำลังตรวจสอบ session เริ่มต้นจาก Firebase Auth หรือไม่
  const [initializing, setInitializing] = useState(true);
  // ข้อมูลผู้ใช้ปัจจุบันที่ล็อกอินอยู่ (เป็น null หากยังไม่ได้ล็อกอิน)
  const [user, setUser] = useState(null);

  useEffect(() => {
    // ติดตามสถานะการล็อกอินของผู้ใช้แบบ Real-time
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      // เมื่อตรวจสอบ session เริ่มต้นเสร็จสิ้น ให้ปิดสถานะ initializing
      if (initializing) {
        setInitializing(false);
      }
    });

    // Cleanup subscription เมื่อคอมโพเนนต์ถูก Unmount
    return unsubscribe;
  }, []);

  // ขณะกำลังเช็ค session เริ่มต้น ไม่ต้องเรนเดอร์อะไรเพื่อป้องกันหน้าจอกระพริบ
  if (initializing) return null;

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {user ? (
            // ==========================================
            // กลุ่มหน้าจอสำหรับผู้ใช้งานที่ล็อกอินแล้ว (Authenticated)
            // ==========================================
            <>
              {/* หน้าหลัก: แสดงรายการวิชาที่สร้าง/เข้าร่วม */}
              <Stack.Screen
                name="Home"
                component={HomeScreen}
              />

              {/* หน้ารายละเอียดวิชา: จัดการเฉลยและตรวจกระดาษคำตอบ */}
              <Stack.Screen
                name="Subject"
                component={SubjectScreen}
              />

              {/* หน้าสแกน: ถ่ายภาพและตรวจจับ OMR ด้วย AI YOLO */}
              <Stack.Screen
                name="Scan"
                component={ScanScreen}
              />

              {/* หน้าประวัติการสแกน: ดูรายการกระดาษคำตอบที่ตรวจไปแล้ว */}
              <Stack.Screen
                name="OMR"
                component={OMRScreen}
              />

              {/* หน้าเฉลย: กำหนดเฉลย 1-5 สำหรับแต่ละข้อ */}
              <Stack.Screen
                name="AnswerKey"
                component={AnswerKeyScreen}
              />

              {/* หน้ารวมคะแนน: สรุปคะแนนนักเรียน, สถิติ Mean/Max/Min และแก้ไขคะแนน */}
              <Stack.Screen
                name="Score"
                component={ScoreScreen}
              />

              {/* หน้าเพิ่ม/แก้ไขวิชา: ฟอร์มระบุชื่อวิชา, รหัสวิชา, ห้องเรียน */}
              <Stack.Screen
                name="Add"
                component={AddScreen}
              />

              {/* หน้าตั้งค่า: ข้อมูลผู้ใช้, เปลี่ยนรูปโปรไฟล์, เปลี่ยนรหัสผ่าน, ตั้งค่า Server IP */}
              <Stack.Screen
                name="Setting"
                component={SettingScreen}
              />
            </>
          ) : (
            // ==========================================
            // กลุ่มหน้าจอสำหรับผู้ใช้ที่ยังไม่ได้ล็อกอิน (Guest)
            // ==========================================
            <>
              {/* หน้า Landing Page ต้อนรับ */}
              <Stack.Screen
                name="FScreen"
                component={FScreen}
              />

              {/* หน้าจอเข้าสู่ระบบ */}
              <Stack.Screen
                name="Login"
                component={LoginScreen}
              />

              {/* หน้าจอสมัครสมาชิกใหม่ */}
              <Stack.Screen
                name="Signup"
                component={SignupScreen}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}