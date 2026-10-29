/**
 * userProfileStorage.js
 * ตัวช่วยจัดการเก็บข้อมูลเพิ่มเติมของโปรไฟล์ผู้ใช้งาน เช่น รหัสนิสิต/นักศึกษา (Student ID)
 * ทำงานร่วมกันทั้ง Mobile (AsyncStorage) และ Web (localStorage) เพื่อความต่อเนื่องในการใช้งาน
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// แคชรหัสนักเรียนตาม user ID ในหน่วยความจำ (In-memory cache)
let memoryStudentIds = {};

/**
 * ดึงรหัสนักเรียน/นิสิตของผู้ใช้ตาม UID
 * @param {string} uid - User UID จาก Firebase Authentication
 * @returns {string} รหัสนักเรียน/นิสิต
 */
export const getLocalStudentId = (uid) => {
  if (!uid) return '';
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const saved = window.localStorage.getItem(`omr_student_id_${uid}`);
      if (saved) return saved;
    } catch (e) {
      console.warn('Could not read studentId from localStorage:', e);
    }
  }
  return memoryStudentIds[uid] || '';
};

/**
 * บันทึกรหัสนักเรียน/นิสิตของผู้ใช้ตาม UID
 * @param {string} uid - User UID จาก Firebase Authentication
 * @param {string} studentId - รหัสนิสิต (เช่น 10 หลัก)
 */
export const setLocalStudentId = (uid, studentId) => {
  if (!uid) return;
  memoryStudentIds[uid] = studentId;
  AsyncStorage.setItem(`omr_student_id_${uid}`, String(studentId)).catch(() => {});
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(`omr_student_id_${uid}`, studentId);
    } catch (e) {
      console.warn('Could not save studentId to localStorage:', e);
    }
  }
};

