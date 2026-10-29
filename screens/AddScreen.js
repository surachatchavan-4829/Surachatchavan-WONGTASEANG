import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  StatusBar,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// นำเข้าโมดูล Firebase Firestore และ Authentication
import { auth, db } from '../firebaseConfig';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../theme';

/**
 * AddScreen: หน้าจอสำหรับ "สร้างรายวิชาใหม่" หรือ "แก้ไขข้อมูลรายวิชาเดิม"
 * @param {object} route - รับค่าพารามิเตอร์ที่ส่งมาจากหน้าก่อนหน้า เช่น subjectToEdit (หากเป็นการแก้ไข)
 * @param {object} navigation - อ็อบเจกต์สำหรับสั่งการนำทาง/เปลี่ยนหน้าจอ
 */
export default function AddScreen({ route, navigation }) {
  // ดึงข้อมูลวิชาที่ส่งมาเพื่อเช็คว่าเป็นการ "แก้ไข" หรือ "สร้างใหม่"
  const { subjectToEdit } = route.params || {};
  const isEditMode = Boolean(subjectToEdit?.id);

  // ดึงข้อมูลผู้ใช้ปัจจุบันที่ล็อกอินอยู่ เพื่อนำชื่อมาเป็นค่าเริ่มต้นของอาจารย์ผู้สอน
  const currentUser = auth.currentUser;
  const defaultTeacherName = currentUser?.displayName || currentUser?.email || '';

  // ===== State สำหรับเก็บค่าฟอร์มกรอกข้อมูล =====
  // 1. รหัสวิชา (subjectCode) เช่น CS101
  const [subjectCode, setSubjectCode] = useState(subjectToEdit?.subjectCode || '');
  // 2. ชื่อวิชา (subjectName) เช่น การเขียนโปรแกรมคอมพิวเตอร์
  const [subjectName, setSubjectName] = useState(subjectToEdit?.subjectName || '');
  // 3. อาจารย์ผู้สอน (teacher)
  const [teacher, setTeacher] = useState(subjectToEdit?.teacher || defaultTeacherName);

  /**
   * handleSave: ฟังก์ชันบันทึกข้อมูลรายวิชาลง Firebase Firestore
   * - ตรวจสอบความครบถ้วนของข้อมูล
   * - กรณี Edit: อัปเดตข้อมูลเอกสารเดิมใน Firestore (collection: subjects)
   * - กรณี Create: เพิ่มเอกสารใหม่ พร้อมผูกสิทธิ์เจ้าของวิชา (owner)
   */
  const handleSave = async () => {
    const finalTeacher = teacher.trim() || defaultTeacherName;

    // ตรวจสอบความถูกต้องของข้อมูล (Validation) ห้ามเว้นว่างรหัสวิชาและชื่อวิชา
    if (
      subjectCode.trim() === '' ||
      subjectName.trim() === ''
    ) {
      Alert.alert('แจ้งเตือน', 'กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    try {
      if (isEditMode) {
        // --- กรณีที่ 1: อัปเดตข้อมูลวิชาเดิม (Edit Mode) ---
        const docRef = doc(db, 'subjects', subjectToEdit.id);
        await updateDoc(docRef, {
          subjectCode: subjectCode.trim(),
          subjectName: subjectName.trim(),
          teacher: finalTeacher,
          updatedAt: serverTimestamp(), // บันทึกเวลาที่แก้ไขล่าสุด
        });
        Alert.alert('สำเร็จ', 'อัปเดตข้อมูลรายวิชาเรียบร้อยแล้ว');
      } else {
        // --- กรณีที่ 2: เพิ่มรายวิชาใหม่ (Create Mode) ---
        await addDoc(collection(db, 'subjects'), {
          subjectCode: subjectCode.trim(),
          subjectName: subjectName.trim(),
          teacher: finalTeacher,
          owner: currentUser ? currentUser.uid : '', // รหัส UID ของเจ้าของวิชา
          ownerName: defaultTeacherName,
          joinedUsers: currentUser ? [currentUser.uid] : [], // ผู้ที่มีสิทธิ์เข้าถึงวิชานี้
          createdAt: serverTimestamp(), // เวลาที่สร้างเอกสาร
        });
        Alert.alert('สำเร็จ', 'เพิ่มรายวิชาเรียบร้อย');
      }

      // บันทึกเสร็จ ย้อนกลับไปหน้าจอก่อนหน้า
      navigation.goBack();
    } catch (error) {
      // แสดงข้อความแจ้งเตือนกรณีเกิดข้อผิดพลาดในการเชื่อมต่อ Firebase
      Alert.alert('Error', error.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* ตั้งค่าสีของแถบสถานะด้านบน (Status Bar) */}
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* ===== 1. แถบหัวข้อด้านบน (Header Bar) ===== */}
      <View style={styles.header}>
        {/* ปุ่มย้อนกลับ */}
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.textLight} />
        </TouchableOpacity>
        {/* ชื่อหัวข้อ: เปลี่ยนตามโหมดแก้ไขหรือสร้างใหม่ */}
        <Text style={styles.headerTitle}>{isEditMode ? 'แก้ไขข้อมูลรายวิชา' : 'เพิ่มรายวิชาใหม่'}</Text>
        {/* ช่องว่างหลอกเพื่อจัดกึ่งกลาง Title */}
        <View style={{ width: 40 }} />
      </View>

      {/* ===== 2. ฟอร์มกรอกข้อมูล (Form Content) ===== */}
      <ScrollView contentContainerStyle={styles.formContent} showsVerticalScrollIndicator={false}>
        {/* คำอธิบายฟอร์ม */}
        <Text style={styles.formSubtitle}>
          {isEditMode ? 'แก้ไขรายละเอียดของรายวิชานี้' : 'กรุณากรอกรายละเอียดรายวิชาที่ต้องการสร้าง'}
        </Text>

        {/* ช่องกรอกที่ 1: รหัสวิชา */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>รหัสวิชา</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="barcode-outline" size={20} color={COLORS.slate} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="เช่น CS101, TH202"
              placeholderTextColor={COLORS.slate}
              value={subjectCode}
              onChangeText={setSubjectCode}
            />
          </View>
        </View>

        {/* ช่องกรอกที่ 2: ชื่อวิชา */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>ชื่อวิชา</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="book-outline" size={20} color={COLORS.slate} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="เช่น การเขียนโปรแกรมคอมพิวเตอร์"
              placeholderTextColor={COLORS.slate}
              value={subjectName}
              onChangeText={setSubjectName}
            />
          </View>
        </View>

        {/* ช่องกรอกที่ 3: อาจารย์ผู้สอน */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>อาจารย์ผู้สอน</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={20} color={COLORS.slate} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="ชื่อผู้สอน"
              placeholderTextColor={COLORS.slate}
              value={teacher}
              onChangeText={setTeacher}
            />
          </View>
        </View>

        {/* ===== 3. ปุ่มกดบันทึกข้อมูล (Submit Button) ===== */}
        <TouchableOpacity
          style={styles.button}
          onPress={handleSave}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.textLight} style={{ marginRight: 8 }} />
          <Text style={styles.buttonText}>{isEditMode ? 'บันทึกการแก้ไข' : 'บันทึกรายวิชา'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ===== สไตล์การตกแต่งหน้าจอ (StyleSheet) =====
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    // จัดระยะขอบบนสำหรับ Android เพื่อไม่ให้ทับกับ Status Bar
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },

  // แถบ Header สีหลักด้านบน
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // ปุ่มย้อนกลับทรงกลมโปร่งแสง
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ข้อความหัวข้อด้านบน
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textLight,
  },

  // กล่องฟอร์มกรอกข้อมูล
  formContent: {
    padding: 20,
  },

  // ข้อความคำอธิบายใต้หัวข้อ
  formSubtitle: {
    fontSize: 14,
    color: COLORS.slate,
    marginBottom: 20,
  },

  // กลุ่มฟิลด์ข้อมูลแต่ละช่อง
  inputGroup: {
    marginBottom: 18,
  },

  // ป้ายกำกับชื่อช่อง (Label)
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },

  // กล่องหุ้มช่องกรอกพร้อมไอคอน
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },

  // ไอคอนหน้าช่องกรอก
  inputIcon: {
    marginRight: 10,
  },

  // ช่องกรอกข้อความ (TextInput)
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.textPrimary,
  },

  // ปุ่มกดบันทึกข้อมูลหลัก
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.primaryDark,
    ...SHADOWS.medium,
  },

  // ข้อความบนปุ่มบันทึก
  buttonText: {
    color: COLORS.textLight,
    fontSize: 18,
    fontWeight: 'bold',
  },
});