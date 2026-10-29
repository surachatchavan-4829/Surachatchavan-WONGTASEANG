import React, { useState } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, StatusBar, ActivityIndicator,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// นำเข้า Firebase Authentication และ Firestore
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../theme';
import { setLocalStudentId } from '../userProfileStorage';
import CustomAlertModal from '../components/CustomAlertModal';

/**
 * SignupScreen: หน้าจอลงทะเบียนสร้างบัญชีผู้ใช้งานใหม่ (Sign Up)
 * มีระบบตรวจสอบความถูกต้องครบถ้วน (Validation):
 * 1. ชื่อผู้ใช้ (ภาษาไทย/อังกฤษเท่านั้น)
 * 2. รหัสประจำตัว (ตัวเลข 10 หลัก และไม่ซ้ำกับคนอื่นในระบบ)
 * 3. รูปแบบอีเมลที่ถูกต้อง
 * 4. รหัสผ่านความยาวขั้นต่ำ 8 ตัวอักษร
 * 5. การยืนยันรหัสผ่านต้องตรงกัน
 * บันทึกข้อมูลทั้งใน Firebase Auth และ Firestore ('users')
 * @param {object} navigation - อ็อบเจกต์สำหรับสั่งการนำทางไปยังหน้าจออื่น
 */
const SignupScreen = ({ navigation }) => {
  // ===== State ฟอร์มข้อมูลการลงทะเบียน =====
  const [displayName, setDisplayName] = useState('');                 // ชื่อผู้ใช้งาน
  const [studentId, setStudentId] = useState('');                     // รหัสนิสิต (10 หลัก)
  const [email, setEmail] = useState('');                             // อีเมล
  const [password, setPassword] = useState('');                       // รหัสผ่าน
  const [confirmPassword, setConfirmPassword] = useState('');         // ยืนยันรหัสผ่าน
  const [showPassword, setShowPassword] = useState(false);             // สลับดู/ซ่อนรหัสผ่าน
  const [showConfirmPassword, setShowConfirmPassword] = useState(false); // สลับดู/ซ่อนยืนยันรหัสผ่าน
  const [loading, setLoading] = useState(false);                       // สถานะกำลังโหลด

  // ข้อความแจ้งเตือนสีแดงใต้แต่ละช่อง (Inline Error Message)
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
   * showAlert: เปิด Modal แจ้งเตือน
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
   * closeAlert: ปิด Modal แจ้งเตือน
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
   * handleSignup: ฟังก์ชันตรวจสอบความถูกต้องและลงทะเบียนสร้างบัญชีใหม่
   * ขั้นตอน:
   * 1. ตรวจสอบว่ากรอกข้อมูลครบทุกช่องหรือไม่
   * 2. ตรวจสอบชื่อผู้ใช้งาน (ตัวอักษรภาษาไทย/อังกฤษเท่านั้น)
   * 3. ตรวจสอบรหัสประจำตัว (ตัวเลข 10 หลัก)
   * 4. ตรวจสอบรูปแบบอีเมล (Regex)
   * 5. ตรวจสอบความยาวรหัสผ่าน (ขั้นต่ำ 8 ตัวอักษร)
   * 6. ตรวจสอบรหัสผ่านทั้งสองช่องว่าตรงกันหรือไม่
   * 7. ตรวจสอบว่ารหัสประจำตัวเคยลงทะเบียนใน Firestore หรือยัง (ป้องกันการซ้ำ)
   * 8. สร้างบัญชีผ่าน Firebase Auth (createUserWithEmailAndPassword)
   * 9. บันทึกข้อมูลเพิ่มเติมลง Firestore ('users/{uid}')
   */
  const handleSignup = async () => {
    const trimmedName = displayName.trim();
    const trimmedStudentId = studentId.trim();
    const trimmedEmail = email.trim();

    const newErrors = {};

    // 1. ตรวจสอบข้อมูลไม่ครบ (Validation Check 1)
    if (!trimmedName) newErrors.displayName = 'กรุณากรอกชื่อผู้ใช้งาน';
    if (!trimmedStudentId) newErrors.studentId = 'กรุณากรอกรหัสประจำตัว';
    if (!trimmedEmail) newErrors.email = 'กรุณากรอกอีเมล';
    if (!password) newErrors.password = 'กรุณากรอกรหัสผ่าน';
    if (!confirmPassword) newErrors.confirmPassword = 'กรุณายืนยันรหัสผ่าน';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showAlert('แจ้งเตือน', 'กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
      return;
    }

    // 2. ตรวจสอบชื่อผู้ใช้งาน (ตัวอักษรภาษาไทยหรือภาษาอังกฤษเท่านั้น)
    const nameRegex = /^[a-zA-Z\u0E00-\u0E7F\s]+$/;
    if (!nameRegex.test(trimmedName)) {
      setErrors({ displayName: 'ชื่อผู้ใช้งานต้องเป็นตัวอักษรภาษาไทยหรืออังกฤษเท่านั้น' });
      showAlert('แจ้งเตือน', 'ชื่อผู้ใช้งานต้องเป็นตัวอักษรภาษาไทยหรือภาษาอังกฤษเท่านั้น (ห้ามมีตัวเลขหรือสัญลักษณ์พิเศษ)', 'warning');
      return;
    }

    // 3. ตรวจสอบรหัสประจำตัวต้องมี 10 ตัวเลข
    if (trimmedStudentId.length !== 10 || !/^\d{10}$/.test(trimmedStudentId)) {
      setErrors({ studentId: 'รหัสประจำตัวต้องมี 10 ตัว' });
      showAlert('แจ้งเตือน', 'รหัสประจำตัวต้องมี 10 ตัว', 'warning');
      return;
    }

    // 4. ตรวจสอบรูปแบบอีเมล
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setErrors({ email: 'อีเมลไม่ถูกต้อง' });
      showAlert('แจ้งเตือน', 'อีเมลไม่ถูกต้อง', 'warning');
      return;
    }

    // 5. ตรวจสอบความยาวรหัสผ่านขั้นต่ำ 8 ตัวอักษร
    if (password.length < 8) {
      setErrors({ password: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
      showAlert('แจ้งเตือน', 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', 'warning');
      return;
    }

    // 6. ตรวจสอบการยืนยันรหัสผ่านตรงกัน
    if (password !== confirmPassword) {
      setErrors({ confirmPassword: 'รหัสผ่านไม่ตรงกัน' });
      showAlert('แจ้งเตือน', 'รหัสผ่านไม่ตรงกัน', 'warning');
      return;
    }

    setLoading(true);

    // 7. ตรวจสอบรหัสประจำตัวที่มีอยู่แล้วในระบบ Firestore (ป้องกันซ้ำ)
    try {
      const q = query(collection(db, 'users'), where('studentId', '==', trimmedStudentId));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        setErrors({ studentId: 'รหัสประจำตัวนี้เคยลงทะเบียนแล้ว' });
        showAlert('แจ้งเตือน', 'รหัสประจำตัวนี้เคยลงทะเบียนแล้ว', 'warning');
        setLoading(false);
        return;
      }
    } catch (checkErr) {
      console.warn('Check existing studentId error:', checkErr.message);
    }

    try {
      // 8. สร้างบัญชีผ่าน Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      if (userCredential.user) {
        // อัปเดต Display Name ใน Auth Profile
        await updateProfile(userCredential.user, {
          displayName: trimmedName,
        });

        // บันทึกรหัสนิสิตลง Local Storage ของเครื่อง
        if (trimmedStudentId) {
          setLocalStudentId(userCredential.user.uid, trimmedStudentId);
        }

        // 9. บันทึกข้อมูลลง Firestore collection 'users'
        try {
          await setDoc(doc(db, 'users', userCredential.user.uid), {
            displayName: trimmedName,
            studentId: trimmedStudentId,
            email: trimmedEmail,
            createdAt: new Date().toISOString(),
          }, { merge: true });
        } catch (fsErr) {
          console.warn('Firestore user doc creation skipped:', fsErr.message);
        }
      }

      setErrors({});
      showAlert('สำเร็จ', 'สร้างบัญชีเรียบร้อยแล้ว', 'success');
    } catch (error) {
      console.error('Signup Error:', error);
      let errorMessage = 'ไม่สามารถลงทะเบียนได้';
      const errMap = {};

      // แปลง Error Code ของ Firebase เป็นภาษาไทย
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'อีเมลนี้ถูกใช้งานแล้ว';
          errMap.email = 'อีเมลนี้ถูกใช้งานแล้ว';
          break;
        case 'auth/weak-password':
          errorMessage = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
          errMap.password = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
          break;
        case 'auth/invalid-email':
          errorMessage = 'อีเมลไม่ถูกต้อง';
          errMap.email = 'อีเมลไม่ถูกต้อง';
          break;
        default:
          errorMessage = error.message || 'เกิดข้อผิดพลาด';
      }

      setErrors(errMap);
      showAlert('ข้อผิดพลาด', errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* แถบสถานะด้านบน */}
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
          {/* ===== 1. ส่วนหัวเรื่องและโลโก้ (Header) ===== */}
          <View style={styles.headerContainer}>
            <View style={styles.logoBadge}>
              <Ionicons name="person-add" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>ลงทะเบียน</Text>
            <Text style={styles.subtitle}>สร้างบัญชีผู้ใช้งานใหม่สำหรับระบบตรวจข้อสอบ</Text>
          </View>

          {/* ===== 2. ฟอร์มกรอกข้อมูลลงทะเบียน (Input Form) ===== */}
          <View style={styles.inputContainer}>
            {/* ช่อง 1: ชื่อผู้ใช้งาน */}
            <View style={[styles.inputWrapper, errors.displayName && styles.inputWrapperError]}>
              <Ionicons
                name="person-outline"
                size={20}
                color={errors.displayName ? COLORS.error : COLORS.slate}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="ชื่อผู้ใช้งาน (ภาษาไทย/อังกฤษ)"
                placeholderTextColor={COLORS.slate}
                value={displayName}
                onChangeText={handleFieldChange(setDisplayName, 'displayName')}
                autoCapitalize="words"
              />
            </View>
            {errors.displayName ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                <Text style={styles.errorText}>{errors.displayName}</Text>
              </View>
            ) : null}

            {/* ช่อง 2: รหัสประจำตัว (10 หลัก) */}
            <View style={[styles.inputWrapper, errors.studentId && styles.inputWrapperError]}>
              <Ionicons
                name="id-card-outline"
                size={20}
                color={errors.studentId ? COLORS.error : COLORS.slate}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="รหัสประจำตัว (10 หลัก)"
                placeholderTextColor={COLORS.slate}
                value={studentId}
                onChangeText={handleFieldChange(setStudentId, 'studentId')}
                keyboardType="number-pad"
                maxLength={15}
              />
            </View>
            {errors.studentId ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                <Text style={styles.errorText}>{errors.studentId}</Text>
              </View>
            ) : null}

            {/* ช่อง 3: อีเมล */}
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
              />
            </View>
            {errors.email ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                <Text style={styles.errorText}>{errors.email}</Text>
              </View>
            ) : null}

            {/* ช่อง 4: รหัสผ่าน */}
            <View style={[styles.inputWrapper, errors.password && styles.inputWrapperError]}>
              <Ionicons
                name="key-outline"
                size={20}
                color={errors.password ? COLORS.error : COLORS.slate}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="รหัสผ่าน (8 ตัวขึ้นไป)"
                placeholderTextColor={COLORS.slate}
                value={password}
                onChangeText={handleFieldChange(setPassword, 'password')}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
                <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color={COLORS.slate} />
              </TouchableOpacity>
            </View>
            {errors.password ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                <Text style={styles.errorText}>{errors.password}</Text>
              </View>
            ) : null}

            {/* ช่อง 5: ยืนยันรหัสผ่าน */}
            <View style={[styles.inputWrapper, errors.confirmPassword && styles.inputWrapperError]}>
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color={errors.confirmPassword ? COLORS.error : COLORS.slate}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="ยืนยันรหัสผ่าน"
                placeholderTextColor={COLORS.slate}
                value={confirmPassword}
                onChangeText={handleFieldChange(setConfirmPassword, 'confirmPassword')}
                secureTextEntry={!showConfirmPassword}
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={{ padding: 4 }}>
                <Ionicons name={showConfirmPassword ? "eye-outline" : "eye-off-outline"} size={20} color={COLORS.slate} />
              </TouchableOpacity>
            </View>
            {errors.confirmPassword ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                <Text style={styles.errorText}>{errors.confirmPassword}</Text>
              </View>
            ) : null}
          </View>

          {/* ===== 3. ปุ่มกดสร้างบัญชี (Submit Button) ===== */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.textLight} />
            ) : (
              <Text style={styles.buttonText}>สร้างบัญชี</Text>
            )}
          </TouchableOpacity>

          {/* ลิงก์สำหรับผู้ใช้ที่มีบัญชีอยู่แล้ว เพื่อไปหน้า Login */}
          <TouchableOpacity onPress={() => navigation.navigate('Login')} disabled={loading}>
            <Text style={styles.linkText}>
              มีบัญชีอยู่แล้ว? <Text style={styles.linkHighlight}>เข้าสู่ระบบที่นี่</Text>
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

  // กล่องคอนเทนต์ที่เลื่อนได้
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ส่วนหัวเรื่อง
  headerContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },

  // วงกลมไอคอนรูปคนเพิ่ม
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

  // หัวข้อ "ลงทะเบียน"
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

  // กล่องรวมช่องกรอกทั้งหมด
  inputContainer: {
    width: '100%',
    marginBottom: 16,
  },

  // กรอบช่องกรอกปกติ
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

  // กรอบช่องกรอกเมื่อมี Error สีแดง
  inputWrapperError: {
    borderColor: COLORS.error,
    backgroundColor: '#FFF8F8',
    borderWidth: 1.5,
  },

  // แถวข้อความ Error สีแดงใต้ช่อง
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

  // ปุ่มกดสร้างบัญชี
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

export default SignupScreen;