import React, { useState } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// นำเข้าฟังก์ชันเข้าสู่ระบบและรีเซ็ตรหัสผ่านจาก Firebase Authentication
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../theme';
import CustomAlertModal from '../components/CustomAlertModal';

/**
 * LoginScreen: หน้าจอเข้าสู่ระบบ (Sign In)
 * ให้ผู้ใช้กรอกอีเมลและรหัสผ่านเพื่อเข้าใช้งานระบบตรวจข้อสอบ OMR,
 * รองรับการตรวจสอบข้อผิดพลาด (Validation), ซ่อน/แสดงรหัสผ่าน,
 * และฟังก์ชันขอรีเซ็ตรหัสผ่านผ่านอีเมล (Forgot Password)
 * @param {object} navigation - อ็อบเจกต์สำหรับสั่งการนำทางไปยังหน้าจออื่น
 */
const LoginScreen = ({ navigation }) => {
  // ===== State สำหรับเก็บข้อมูลฟอร์ม =====
  const [email, setEmail] = useState('');                 // อีเมลของผู้ใช้
  const [password, setPassword] = useState('');           // รหัสผ่านของผู้ใช้
  const [showPassword, setShowPassword] = useState(false); // ควบคุมการเปิด/ปิดการมองเห็นรหัสผ่าน (ดวงตา)
  const [loading, setLoading] = useState(false);           // แสดงสถานะกำลังโหลด (หมุนติ้วๆ)

  // ข้อความแจ้งเตือนสีแดงใต้แต่ละช่อง เช่น errors.email, errors.password
  const [errors, setErrors] = useState({});

  // กล่องแจ้งเตือน Modal สีแดงแบบกำหนดเอง (Custom Alert Modal)
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: 'แจ้งเตือน',
    message: '',
    type: 'warning',
    onConfirm: null,
  });

  /**
   * showAlert: ฟังก์ชันเปิด Modal แจ้งเตือน
   * @param {string} title - หัวข้อแจ้งเตือน
   * @param {string} message - ข้อความรายละเอียด
   * @param {string} type - ชนิดการเตือน ('warning' | 'error' | 'success')
   * @param {function} onConfirm - ฟังก์ชัน callback เมื่อกดยืนยัน
   */
  const showAlert = (title, message, type = 'warning', onConfirm = null) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
      onConfirm,
    });
  };

  /**
   * closeAlert: ฟังก์ชันปิด Modal แจ้งเตือน และรัน callback (ถ้ามี)
   */
  const closeAlert = () => {
    const cb = alertConfig.onConfirm;
    setAlertConfig((prev) => ({ ...prev, visible: false, onConfirm: null }));
    if (cb) cb();
  };

  /**
   * handleFieldChange: จัดการเมื่อผู้ใช้พิมพ์ข้อความในช่องกรอก
   * และล้างข้อความ Error สีแดงของช่องนั้นออกทันทีเมื่อผู้ใช้เริ่มพิมพ์แก้ไข
   */
  const handleFieldChange = (setter, fieldName) => (text) => {
    setter(text);
    if (errors[fieldName]) {
      setErrors((prev) => ({ ...prev, [fieldName]: '' }));
    }
  };

  /**
   * handleLogin: ฟังก์ชันตรวจสอบและส่งข้อมูลเข้าสู่ระบบ Firebase Authentication
   * 1. ตรวจสอบความครบถ้วนของอีเมลและรหัสผ่าน
   * 2. เรียกใช้ฟังก์ชัน signInWithEmailAndPassword()
   * 3. ดักจับ Error Code แปลงเป็นข้อความภาษาไทยที่เข้าใจง่าย
   */
  const handleLogin = async () => {
    const trimmedEmail = email.trim();
    const newErrors = {};

    // ตรวจสอบความถูกต้องเบื้องต้น (Validation)
    if (!trimmedEmail) newErrors.email = 'กรุณากรอกอีเมล';
    if (!password) newErrors.password = 'กรุณากรอกรหัสผ่าน';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showAlert('แจ้งเตือน', 'กรุณากรอกอีเมลและรหัสผ่าน', 'warning');
      return;
    }

    setLoading(true);

    try {
      // ส่งข้อมูลเข้าสู่ระบบผ่าน Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      console.log('Logged in with:', userCredential.user.email);
      setErrors({});
    } catch (error) {
      console.error('Login Error:', error.code, error.message);

      let errorMessage = 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ';
      const errMap = {};

      // แปลง Error Code ของ Firebase เป็นภาษาไทย
      switch (error.code) {
        case 'auth/invalid-email':
          errorMessage = 'รูปแบบอีเมลไม่ถูกต้อง';
          errMap.email = 'รูปแบบอีเมลไม่ถูกต้อง';
          break;
        case 'auth/user-not-found':
          errorMessage = 'ไม่พบผู้ใช้งานด้วยอีเมลนี้';
          errMap.email = 'ไม่พบผู้ใช้งานด้วยอีเมลนี้';
          break;
        case 'auth/wrong-password':
          errorMessage = 'รหัสผ่านไม่ถูกต้อง';
          errMap.password = 'รหัสผ่านไม่ถูกต้อง';
          break;
        case 'auth/invalid-credential':
          errorMessage = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
          errMap.email = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
          errMap.password = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณาลองใหม่ในภายหลัง';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้';
          break;
        case 'auth/user-disabled':
          errorMessage = 'บัญชีผู้ใช้นี้ถูกระงับ';
          break;
        default:
          errorMessage = error.message || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
      }

      setErrors(errMap);
      showAlert('เกิดข้อผิดพลาด', errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  /**
   * handleForgotPassword: ฟังก์ชันส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลของผู้ใช้
   * ตรวจสอบความถูกต้องของอีเมลด้วย Regular Expression (Regex)
   * และเรียก sendPasswordResetEmail() จาก Firebase Auth
   */
  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrors((prev) => ({ ...prev, email: 'กรุณากรอกอีเมลเพื่อรีเซ็ตรหัสผ่าน' }));
      showAlert('แจ้งเตือน', 'กรุณากรอกอีเมลในช่องด้านบน เพื่อส่งลิงก์รีเซ็ตรหัสผ่าน', 'warning');
      return;
    }
    // ตรวจสอบรูปแบบอีเมล (Email Regex)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setErrors((prev) => ({ ...prev, email: 'รูปแบบอีเมลไม่ถูกต้อง' }));
      showAlert('แจ้งเตือน', 'รูปแบบอีเมลไม่ถูกต้อง', 'warning');
      return;
    }

    setLoading(true);
    try {
      // สั่ง Firebase ส่งอีเมลรีเซ็ตรหัสผ่าน
      await sendPasswordResetEmail(auth, trimmedEmail);
      showAlert(
        'สำเร็จ',
        `ระบบได้ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมล:\n${trimmedEmail}\n\nกรุณาตรวจสอบกล่องข้อความในอีเมลของคุณเพื่อตั้งรหัสผ่านใหม่`,
        'success'
      );
    } catch (err) {
      console.error('Password reset error:', err);
      let msg = 'ไม่สามารถส่งลิงก์รีเซ็ตรหัสผ่านได้';
      if (err.code === 'auth/user-not-found') {
        msg = 'ไม่พบผู้ใช้งานด้วยอีเมลนี้ในระบบ';
        setErrors((prev) => ({ ...prev, email: 'ไม่พบผู้ใช้งานด้วยอีเมลนี้' }));
      } else if (err.code === 'auth/invalid-email') {
        msg = 'รูปแบบอีเมลไม่ถูกต้อง';
        setErrors((prev) => ({ ...prev, email: 'รูปแบบอีเมลไม่ถูกต้อง' }));
      }
      showAlert('ข้อผิดพลาด', msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* ตั้งค่าสีแถบสถานะด้านบน */}
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      {/* กล่องแจ้งเตือนป๊อปอัปสีแดง/เหลืองแบบปรับแต่งเอง */}
      <CustomAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={closeAlert}
        onConfirm={closeAlert}
      />

      {/* KeyboardAvoidingView: ป้องกันคีย์บอร์ดดันบังช่องกรอกข้อความ */}
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ===== 1. ส่วนหัวข้อและโลโก้แม่กุญแจ (Header) ===== */}
          <View style={styles.headerContainer}>
            <View style={styles.logoBadge}>
              <Ionicons name="lock-closed" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>เข้าสู่ระบบ</Text>
            <Text style={styles.subtitle}>กรุณากรอกอีเมลและรหัสผ่านเพื่อเข้าใช้งาน</Text>
          </View>

          {/* ===== 2. ฟอร์มกรอกข้อมูลเข้าสู่ระบบ (Input Form) ===== */}
          <View style={styles.inputContainer}>
            {/* ช่องกรอกที่ 1: อีเมล */}
            <View style={[styles.inputWrapper, errors.email && styles.inputWrapperError]}>
              <Ionicons
                name="mail-outline"
                size={20}
                color={errors.email ? COLORS.error : COLORS.slate}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="อีเมล"
                placeholderTextColor={COLORS.slate}
                value={email}
                onChangeText={handleFieldChange(setEmail, 'email')}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {/* ข้อความแจ้งเตือนสีแดงกรณีอีเมลไม่ถูกต้อง */}
            {errors.email ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                <Text style={styles.errorText}>{errors.email}</Text>
              </View>
            ) : null}

            {/* ช่องกรอกที่ 2: รหัสผ่าน */}
            <View style={[styles.inputWrapper, errors.password && styles.inputWrapperError]}>
              <Ionicons
                name="key-outline"
                size={20}
                color={errors.password ? COLORS.error : COLORS.slate}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="รหัสผ่าน"
                placeholderTextColor={COLORS.slate}
                value={password}
                onChangeText={handleFieldChange(setPassword, 'password')}
                secureTextEntry={!showPassword} // ซ่อนรหัสผ่านเป็นจุดๆ ตาม State
              />
              {/* ปุ่มไอคอนลูกตาสำหรับกดสลับดู/ซ่อนรหัสผ่าน */}
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
                <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color={COLORS.slate} />
              </TouchableOpacity>
            </View>
            {/* ข้อความแจ้งเตือนสีแดงกรณีรหัสผ่านไม่ถูกต้อง */}
            {errors.password ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                <Text style={styles.errorText}>{errors.password}</Text>
              </View>
            ) : null}
          </View>

          {/* ปุ่มข้อความ "ลืมรหัสผ่าน?" */}
          <TouchableOpacity 
            onPress={handleForgotPassword} 
            disabled={loading}
            style={{ alignSelf: 'flex-end', marginTop: -4, marginBottom: 16, paddingVertical: 4 }}
          >
            <Text style={{ color: COLORS.primary, fontSize: 14, fontWeight: '600' }}>ลืมรหัสผ่าน?</Text>
          </TouchableOpacity>

          {/* ===== 3. ปุ่มกดเข้าสู่ระบบหลัก (Submit Button) ===== */}
          <TouchableOpacity 
            style={[styles.button, loading && styles.buttonDisabled]} 
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.textLight} />
            ) : (
              <Text style={styles.buttonText}>ตกลง</Text>
            )}
          </TouchableOpacity>

          {/* ลิงก์สำหรับผู้ใช้ที่ยังไม่มีบัญชี ไปยังหน้า Signup */}
          <TouchableOpacity onPress={() => navigation.navigate('Signup')} disabled={loading}>
            <Text style={styles.linkText}>
              ยังไม่มีบัญชี? <Text style={styles.linkHighlight}>ลงทะเบียนที่นี่</Text>
            </Text>
          </TouchableOpacity>

          {/* ปุ่มย้อนกลับ */}
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} disabled={loading}>
            <Ionicons name="arrow-back" size={18} color={COLORS.slate} />
            <Text style={styles.backText}>ย้อนกลับ</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ===== สไตล์การตกแต่งหน้าจอ (StyleSheet) =====
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // กล่องคอนเทนต์ที่เลื่อนได้ จัดกึ่งกลางหน้าจอ
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ส่วนหัวเรื่อง
  headerContainer: {
    alignItems: 'center',
    marginBottom: 26,
  },

  // วงกลมไอคอนแม่กุญแจ
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: COLORS.secondary,
  },

  // หัวข้อ "เข้าสู่ระบบ"
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 6,
  },

  // คำอธิบายใต้หัวข้อ
  subtitle: {
    fontSize: 14,
    color: COLORS.slate,
    textAlign: 'center',
  },

  // กล่องรวมช่องกรอกข้อมูล
  inputContainer: {
    width: '100%',
    marginBottom: 12,
  },

  // กรอบช่องกรอกข้อมูลปกติ
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },

  // กรอบช่องกรอกข้อมูลเมื่อมี Error (ขอบสีแดง พื้นหลังอมชมพู)
  inputWrapperError: {
    borderColor: COLORS.error,
    backgroundColor: '#FFF8F8',
    borderWidth: 1.5,
  },

  // แถวข้อความแจ้งเตือนสีแดงใต้ช่องกรอก
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -8,
    marginBottom: 12,
    paddingHorizontal: 6,
  },

  errorText: {
    color: COLORS.error,
    fontSize: 13,
    fontWeight: '600',
  },

  inputIcon: {
    marginRight: 10,
  },

  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.textPrimary,
  },

  // ปุ่มกดเข้าสู่ระบบ (ปุ่มตกลง)
  button: {
    backgroundColor: COLORS.primary,
    width: '100%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.primaryDark,
    ...SHADOWS.medium,
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  buttonText: {
    color: COLORS.textLight,
    fontSize: 18,
    fontWeight: 'bold',
  },

  // ข้อความลิงก์ด้านล่าง
  linkText: {
    color: COLORS.slate,
    fontSize: 14,
  },

  linkHighlight: {
    color: COLORS.primary,
    fontWeight: 'bold',
  },

  // ปุ่มย้อนกลับ
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    gap: 6,
  },

  backText: {
    color: COLORS.slate,
    fontSize: 15,
    fontWeight: '500',
  },
});

export default LoginScreen;