import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../theme';

/**
 * FScreen (First / Welcome Screen):
 * หน้าจอแรกสุด (Landing Page) ที่ผู้ใช้จะเห็นเมื่อเปิดแอปพลิเคชันขึ้นมา
 * ทำหน้าที่ต้อนรับ แนะนำชื่อแอป และให้ผู้ใช้เลือกเข้าสู่ระบบ (Login) หรือลงทะเบียน (Signup)
 * @param {object} navigation - อ็อบเจกต์สำหรับสั่งการนำทางไปยังหน้าจออื่น
 */
const FScreen = ({ navigation }) => {
  return (
    // SafeAreaView: ช่วยจัดการไม่ให้คอนเทนต์ล้นไปโดนขอบจอหรือแถบรอยบาก (Notch)
    <SafeAreaView style={styles.container}>
      {/* StatusBar: ตั้งค่าสีของไอคอนแถบสถานะด้านบน (แบตเตอรี่, สัญญาณ) เป็นสีเข้ม */}
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      {/* ===== 1. ส่วนแบนเนอร์และโลโก้ต้อนรับ (Hero / Branding Section) ===== */}
      <View style={styles.heroSection}>
        {/* วงกลมพื้นหลังไอคอนเอกสาร OMR */}
        <View style={styles.iconCircle}>
          <Ionicons name="document-text" size={64} color={COLORS.primary} />
        </View>

        {/* ชื่อหลักของแอปพลิเคชัน */}
        <Text style={styles.titleText}>ตรวจข้อสอบOMR</Text>

        {/* ป้ายกำกับระบุฟังก์ชันของแอป (Badge) */}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>OMR Sheet Scanner</Text>
        </View>
      </View>

      {/* ===== 2. ส่วนปุ่มดำเนินการหลัก (Action Button Container) ===== */}
      <View style={styles.buttonContainer}>
        {/* ปุ่มที่ 1: เข้าสู่ระบบ (ปุ่มหลักสีเด่น Primary) */}
        <TouchableOpacity
          style={styles.buttonPrimary}
          onPress={() => navigation.navigate('Login')} // นำทางไปยังหน้า LoginScreen
          activeOpacity={0.8}
        >
          <Ionicons name="log-in-outline" size={24} color={COLORS.textLight} style={styles.buttonIcon} />
          <Text style={styles.buttonPrimaryText}>เข้าสู่ระบบ</Text>
        </TouchableOpacity>

        {/* ปุ่มที่ 2: ลงทะเบียนสมาชิกใหม่ (ปุ่มรองสไตล์ Outline) */}
        <TouchableOpacity
          style={styles.buttonSecondary}
          onPress={() => navigation.navigate('Signup')} // นำทางไปยังหน้า SignupScreen
          activeOpacity={0.8}
        >
          <Ionicons name="person-add-outline" size={22} color={COLORS.primary} style={styles.buttonIcon} />
          <Text style={styles.buttonSecondaryText}>ลงทะเบียน</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// ===== สไตล์การตกแต่งหน้าจอ (StyleSheet) =====
const styles = StyleSheet.create({
  // โครงสร้างหลัก จัดให้อยู่กึ่งกลางแนวตั้งและกระจายหัว-ท้าย
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 24,
  },

  // กล่องจัดวางส่วนโลโก้และข้อความด้านบน
  heroSection: {
    alignItems: 'center',
    marginTop: 60,
  },

  // วงกลมลอยตัวสำหรับใส่ไอคอนโลโก้ พร้อมเงาและขอบสีรอง
  iconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 3,
    borderColor: COLORS.secondary,
    ...SHADOWS.medium,
  },

  // ข้อความชื่อแอปขนาดใหญ่
  titleText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 10,
    textAlign: 'center',
  },

  // ป้ายข้อความขนาดเล็ก (Tag / Badge) ใต้ชื่อแอป
  badge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },

  badgeText: {
    color: COLORS.primaryDark,
    fontWeight: '700',
    fontSize: 13,
  },

  subtitleText: {
    fontSize: 15,
    color: COLORS.slate,
    textAlign: 'center',
    maxWidth: '85%',
  },

  // กล่องรวมปุ่มกดด้านล่าง
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
    marginBottom: 30,
  },

  // สไตล์ปุ่มหลัก (เข้าสู่ระบบ) พื้นหลังสีเข้ม มีขอบล่าง 3D มิติ
  buttonPrimary: {
    backgroundColor: COLORS.primary,
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderBottomColor: COLORS.primaryDark,
    ...SHADOWS.medium,
  },

  buttonPrimaryText: {
    fontSize: 20,
    color: COLORS.textLight,
    fontWeight: 'bold',
  },

  // สไตล์ปุ่มรอง (ลงทะเบียน) พื้นหลังสีสว่าง มีเส้นขอบสีหลัก
  buttonSecondary: {
    backgroundColor: COLORS.surface,
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.primary,
    ...SHADOWS.small,
  },

  buttonSecondaryText: {
    fontSize: 20,
    color: COLORS.primary,
    fontWeight: 'bold',
  },

  // ไอคอนในปุ่ม
  buttonIcon: {
    marginRight: 8,
  },
});

export default FScreen;