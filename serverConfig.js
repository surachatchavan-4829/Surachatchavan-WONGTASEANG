/**
 * serverConfig.js
 * ตัวช่วยจัดการ URL ปลายทางของ FastAPI Backend Server สำหรับทั้ง React Native (Mobile) และ Web
 * รองรับการบันทึก IP ลงใน AsyncStorage / localStorage เพื่อให้เปิดแอปครั้งถัดไปไม่ต้องพิมพ์ใหม่
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// URL เริ่มต้นในหน่วยความจำ (Default Server URL ชี้ไปที่ Render Cloud)
let memoryServerUrl = 'https://omrapi.onrender.com';

// โหลดค่า URL ที่เคยบันทึกไว้ใน AsyncStorage ทันทีที่แอปเริ่มทำงาน
AsyncStorage.getItem('omr_server_url')
  .then((saved) => {
    if (saved) memoryServerUrl = saved;
  })
  .catch(() => {});

/**
 * ดึง Server URL ปัจจุบัน
 * - ฝั่ง Web: ตรวจสอบจาก window.localStorage ก่อน
 * - ฝั่ง Mobile: คืนค่าจากตัวแปร memoryServerUrl
 * @returns {string} URL ของ Backend Server เช่น 'https://omrapi.onrender.com'
 */
export const getServerUrl = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = window.localStorage.getItem('omr_server_url');
    if (saved) return saved;
  }
  return memoryServerUrl;
};

/**
 * ตั้งค่าและบันทึก Server URL ใหม่
 * เติม 'https://' หรือ 'http://' ให้อัตโนมัติหากผู้ใช้ไม่ได้พิมพ์มา
 * พร้อมบันทึกลง AsyncStorage และ localStorage
 * @param {string} url - IP หรือ URL ของ Server เช่น 'https://omrapi.onrender.com'
 * @returns {string} URL ที่จัดรูปแบบถูกต้องแล้ว
 */
export const setServerUrlConfig = (url) => {
  if (!url) return memoryServerUrl;
  let formatted = url.trim();
  if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
    if (formatted.includes('onrender.com') || formatted.includes('.app') || formatted.includes('.io')) {
      formatted = `https://${formatted}`;
    } else {
      formatted = `http://${formatted}`;
    }
  }
  memoryServerUrl = formatted;


  // บันทึกทั้ง AsyncStorage (Mobile) และ localStorage (Web)
  AsyncStorage.setItem('omr_server_url', formatted).catch(() => {});
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem('omr_server_url', formatted);
    } catch (e) {
      console.warn('Could not save serverUrl to localStorage:', e);
    }
  }
  return formatted;
};

