import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  Platform,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { auth, db, storage } from '../firebaseConfig';
import {
  signOut,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, uploadString, getDownloadURL } from 'firebase/storage';
import { COLORS, SHADOWS } from '../theme';

import { getLocalStudentId, setLocalStudentId } from '../userProfileStorage';


/**

 * SettingScreen: หน้าจอตั้งค่าโปรไฟล์และบัญชีผู้ใช้งาน
 * รองรับการเปลี่ยนรูปโปรไฟล์ (ถ่ายรูป/แกลเลอรี), แก้ไขชื่อแสดงผล, แก้ไขรหัสนิสิต,
 * แก้ไขอีเมล, ขอรีเซ็ตรหัสผ่าน, และออกจากระบบ (Sign Out)
 * ซิงก์ข้อมูลร่วมกันระหว่าง Firebase Auth, Firestore ('users') และ LocalStorage
 * @param {object} navigation - อ็อบเจกต์สำหรับสั่งการนำทางไปยังหน้าจออื่น
 */
export default function SettingScreen({ navigation }) {

  const user = auth.currentUser;

  // ===== State ข้อมูลโปรไฟล์ผู้ใช้ =====
  const [displayName, setDisplayName] = useState(user?.displayName || '');               // ชื่อที่แสดงของผู้ใช้
  const [photoURL, setPhotoURL] = useState(user?.photoURL || null);                     // URL รูปโปรไฟล์
  const [avatarLoadError, setAvatarLoadError] = useState(false);                         // ดักจับกรณีโหลดรูปไม่สำเร็จ
  const [studentId, setStudentId] = useState(user?.uid ? getLocalStudentId(user.uid) : ''); // รหัสนิสิต (10 หลัก)
  const [userEmail, setUserEmail] = useState(user?.email || '');                         // อีเมลผู้ใช้งาน

  // ===== State ควบคุม Modal และฟอร์มแก้ไขแต่ละฟิลด์ =====
  const [isEditingName, setIsEditingName] = useState(false);                             // Modal แก้ไขชื่อ
  const [tempName, setTempName] = useState('');

  const [isEditingStudentId, setIsEditingStudentId] = useState(false);                   // Modal แก้ไขรหัสนิสิต
  const [tempStudentId, setTempStudentId] = useState('');

  // สถานะการโหลด (Loading Indicator พร้อมข้อความบอกขั้นตอน)


  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  /**
   * Effect: ซิงก์ข้อมูลโปรไฟล์ล่าสุดของผู้ใช้
   * 1. ดึงรหัสนิสิตจากหน่วยความจำเครื่อง (AsyncStorage / userProfileStorage)
   * 2. สั่ง reload Firebase Auth เพื่อดึงอีเมลล่าสุด
   * 3. ดึงข้อมูลรูปภาพ, ชื่อ, และรหัสนิสิตจาก Firestore 'users/{uid}'
   */
  useEffect(() => {
    if (!user?.uid) return;
    const localId = getLocalStudentId(user.uid);
    if (localId) setStudentId(localId);

    const fetchUserData = async () => {
      try {
        if (auth.currentUser) {
          try {
            await auth.currentUser.reload();
            if (auth.currentUser.email) {
              setUserEmail(auth.currentUser.email);
            }
          } catch (_) {}
        }

        const userDocRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.photoURL) {
            setPhotoURL(data.photoURL);
            setAvatarLoadError(false);
          }
          if (data.displayName) {
            setDisplayName(data.displayName);
          }
          if (data.studentId) {
            setStudentId(data.studentId);
            setLocalStudentId(user.uid, data.studentId);
          }
          // หาก auth.currentUser ยังไม่มี email ให้ใช้จาก Firestore
          if (!auth.currentUser?.email && data.email) {
            setUserEmail(data.email);
          }
        }
      } catch (err) {
        console.warn("Firestore user doc access restricted or not configured, using local profile:", err.message);
      }
    };
    fetchUserData();
  }, [user?.uid]);

  /**
   * handleLogout: ฟังก์ชันออกจากระบบ (Sign Out)
   * แสดง Alert กล่องยืนยันก่อน เมื่อยืนยันจะเรียก signOut(auth) เพื่อเคลียร์ Session
   */
  const handleLogout = async () => {
    Alert.alert(
      'ออกจากระบบ',
      'คุณต้องการออกจากระบบหรือไม่',
      [
        {
          text: 'ยกเลิก',
          style: 'cancel',
        },
        {
          text: 'ตกลง',
          onPress: async () => {
            try {
              console.log("Before logout");
              await signOut(auth);
              console.log("Logout success");
            } catch (error) {
              console.log(error);
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  /**
   * handleChangePassword: ขอเปลี่ยนรหัสผ่านผ่านทางอีเมล
   * ส่งลิงก์ไปยังอีเมลของผู้ใช้ผ่าน sendPasswordResetEmail() ของ Firebase Auth
   */
  const handleChangePassword = async () => {
    if (!auth.currentUser) {
      Alert.alert("ข้อผิดพลาด", "ไม่พบผู้ใช้ที่ล็อกอิน");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, auth.currentUser.email);

      Alert.alert(
        "สำเร็จ",
        "ส่งอีเมลสำหรับเปลี่ยนรหัสผ่านแล้ว"
      );

      console.log("Reset email sent");
    } catch (error) {
      console.log("Reset Password Error:", error);
      Alert.alert("Error", error.code + "\n" + error.message);
    }
  };

  /**
   * handlePickImage: แสดงกล่องข้อความให้ผู้ใช้เลือกช่องทางเปลี่ยนรูปโปรไฟล์
   * ระหว่าง 'ถ่ายภาพ' (Camera) หรือ 'เลือกจากคลังภาพ' (Gallery)
   */
  const handlePickImage = () => {
    Alert.alert(
      'เปลี่ยนรูปโปรไฟล์',
      'เลือกช่องทางที่ต้องการ',
      [
        {
          text: 'ถ่ายภาพ',
          onPress: () => takePhoto(),
        },
        {
          text: 'เลือกจากคลังภาพ',
          onPress: () => chooseFromGallery(),
        },
        {
          text: 'ยกเลิก',
          style: 'cancel',
        },
      ]
    );
  };

  /**
   * takePhoto: ขอสิทธิ์เข้าถึงกล้องและเปิดกล้องถ่ายภาพ (Aspect 1:1 จัตุรัส)
   */
  const takePhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('แจ้งเตือน', 'กรุณาอนุญาตให้แอปพลิเคชันเข้าถึงกล้องถ่ายรูป');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await uploadAndSavePhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Camera Error:', error);
      Alert.alert('เกิดข้อผิดพลาด', 'ไม่สามารถเปิดกล้องได้');
    }
  };

  /**
   * chooseFromGallery: ขอสิทธิ์เข้าถึงแกลเลอรีและเปิดให้เลือกรูปภาพ (Aspect 1:1 จัตุรัส)
   */
  const chooseFromGallery = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('แจ้งเตือน', 'กรุณาอนุญาตให้แอปพลิเคชันเข้าถึงคลังภาพ');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await uploadAndSavePhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Gallery Error:', error);
      Alert.alert('เกิดข้อผิดพลาด', 'ไม่สามารถเปิดคลังภาพได้');
    }
  };

  /**
   * uploadAndSavePhoto: ประมวลผลและอัปโหลดรูปโปรไฟล์
   * 1. ย่อขนาดภาพเหลือ 250x250 pixels และบีบอัดคุณภาพเพื่อประหยัดเน็ต
   * 2. อัปโหลดขึ้น Firebase Storage (โฟลเดอร์ profile_pictures/)
   * 3. ซิงก์ URL รูปภาพเข้า Firebase Auth (updateProfile)
   * 4. ซิงก์ URL รูปภาพเข้า Firestore collection 'users' เพื่อแสดงผลได้ทุกเครื่อง
   */
  const uploadAndSavePhoto = async (localUri) => {
    setLoading(true);
    setLoadingText('กำลังอัปโหลดรูปภาพ...');
    try {
      let previewUri = localUri;
      let base64Data = null;

      // ย่อและบีบอัดภาพโปรไฟล์เหลือ 250x250 pixels และแปลงเป็น Base64
      try {
        const manipResult = await ImageManipulator.manipulateAsync(
          localUri,
          [{ resize: { width: 250, height: 250 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        previewUri = manipResult.uri;
        base64Data = manipResult.base64;
      } catch (resizeErr) {
        console.warn('Profile image resize skipped:', resizeErr);
      }

      let cloudPhotoURL = null;

      // 1. อัปโหลดขึ้น Firebase Storage ผ่าน uploadString
      if (base64Data) {
        try {
          const filename = `profile_pictures/${auth.currentUser?.uid || 'user'}_${Date.now()}.jpg`;
          const storageRef = ref(storage, filename);

          const uploadTask = (async () => {
            await uploadString(storageRef, base64Data, 'base64', {
              contentType: 'image/jpeg',
            });
            return await getDownloadURL(storageRef);
          })();

          // Timeout 15 วินาที ป้องกันแอปค้างกรณีเน็ตช้า
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Firebase Storage Upload Timeout')), 15000)
          );

          cloudPhotoURL = await Promise.race([uploadTask, timeoutPromise]);
        } catch (storageError) {
          console.warn('Storage upload skipped or timed out:', storageError.message);
        }
      }

      // 2. กำหนด finalPhotoURL: หาก Storage ล้มเหลวจะสำรองด้วย Base64 Data URL
      let finalPhotoURL = cloudPhotoURL;
      if (!finalPhotoURL && base64Data) {
        finalPhotoURL = `data:image/jpeg;base64,${base64Data}`;
      }
      if (!finalPhotoURL) {
        finalPhotoURL = previewUri;
      }

      // 3. บันทึกใน Firebase Auth
      if (auth.currentUser && cloudPhotoURL) {
        try {
          await updateProfile(auth.currentUser, { photoURL: cloudPhotoURL });
        } catch (authErr) {
          console.warn('Auth updateProfile photoURL error:', authErr.message);
        }
      }

      // 4. บันทึกลง Firestore users เสมอ
      if (auth.currentUser?.uid && finalPhotoURL) {
        try {
          await setDoc(doc(db, 'users', auth.currentUser.uid), { 
            photoURL: finalPhotoURL,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (fsErr) {
          console.warn('Firestore photoURL sync skipped:', fsErr.message);
        }
      }

      setPhotoURL(finalPhotoURL);
      setAvatarLoadError(false);
      Alert.alert('สำเร็จ', 'อัปเดตรูปโปรไฟล์เรียบร้อยแล้ว');
    } catch (error) {
      console.error('Update Photo Error:', error);
      Alert.alert('เกิดข้อผิดพลาด', 'ไม่สามารถเปลี่ยนรูปโปรไฟล์ได้: ' + error.message);
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  /**
   * handleOpenEditName: เปิด Modal แก้ไขชื่อผู้ใช้งาน
   */
  const handleOpenEditName = () => {
    setTempName(displayName);
    setIsEditingName(true);
  };

  /**
   * handleSaveName: บันทึกชื่อผู้ใช้งานใหม่
   * - ตรวจสอบ Regex ต้องเป็นตัวอักษรไทยหรืออังกฤษเท่านั้น
   * - อัปเดตทั้งใน Firebase Auth และ Firestore 'users'
   */
  const handleSaveName = async () => {
    const trimmedName = tempName.trim();
    if (!trimmedName) {
      Alert.alert('แจ้งเตือน', 'กรุณากรอกชื่อผู้ใช้งาน');
      return;
    }

    const nameRegex = /^[a-zA-Z\u0E00-\u0E7F\s]+$/;
    if (!nameRegex.test(trimmedName)) {
      Alert.alert('แจ้งเตือน', 'ชื่อผู้ใช้งานต้องเป็นตัวอักษรภาษาไทยหรือภาษาอังกฤษเท่านั้น');
      return;
    }

    setLoading(true);
    setLoadingText('กำลังบันทึกชื่อ...');
    try {
      await updateProfile(auth.currentUser, { displayName: trimmedName });
      setDisplayName(trimmedName);
      setIsEditingName(false);
      Alert.alert('สำเร็จ', 'อัปเดตชื่อผู้ใช้งานเรียบร้อยแล้ว');

      if (user?.uid) {
        try {
          await setDoc(doc(db, 'users', user.uid), { displayName: trimmedName }, { merge: true });
        } catch (fsErr) {
          console.warn('Firestore update skipped (permission denied or network):', fsErr.message);
        }
      }
    } catch (error) {
      console.error('Update Name Error:', error);
      Alert.alert('เกิดข้อผิดพลาด', 'ไม่สามารถเปลี่ยนชื่อผู้ใช้งานได้: ' + error.message);
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  /**
   * handleOpenEditStudentId: เปิด Modal แก้ไขรหัสนิสิต
   */
  const handleOpenEditStudentId = () => {
    setTempStudentId(studentId);
    setIsEditingStudentId(true);
  };

  /**
   * handleSaveStudentId: บันทึกรหัสนิสิต
   * - ตรวจสอบความถูกต้อง: ต้องเป็นตัวเลข 10 หลักเท่านั้น
   * - บันทึกลง Local Storage (userProfileStorage) และ Firestore 'users'
   */
  const handleSaveStudentId = async () => {
    const trimmedId = tempStudentId.trim();
    if (trimmedId && (!/^\d+$/.test(trimmedId) || trimmedId.length !== 10)) {
      Alert.alert('แจ้งเตือน', 'รหัสประจำตัวต้องเป็นตัวเลข 10 หลักเท่านั้น');
      return;
    }

    setLoading(true);
    setLoadingText('กำลังบันทึกรหัสประจำตัว...');
    try {
      if (user?.uid) {
        setLocalStudentId(user.uid, trimmedId);
      }
      setStudentId(trimmedId);
      setIsEditingStudentId(false);
      Alert.alert('สำเร็จ', 'อัปเดตรหัสประจำตัวเรียบร้อยแล้ว');

      if (user?.uid) {
        try {
          await setDoc(doc(db, 'users', user.uid), { studentId: trimmedId }, { merge: true });
        } catch (fsErr) {
          console.warn('Firestore user update skipped (permission denied or network):', fsErr.message);
        }
      }
    } catch (error) {
      console.error('Update Student ID Error:', error);
      Alert.alert('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกรหัสประจำตัวได้: ' + error.message);
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  return (


    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={COLORS.textLight}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ตั้งค่าระบบ</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <TouchableOpacity style={styles.avatarContainer} onPress={handlePickImage} activeOpacity={0.8}>
            <View style={styles.avatarCircle}>
              {photoURL && !avatarLoadError ? (
                <Image 
                  source={{ uri: photoURL }} 
                  style={styles.avatarImage} 
                  onError={() => setAvatarLoadError(true)}
                />
              ) : (
                <Ionicons
                  name="person"
                  size={36}
                  color={COLORS.primary}
                />
              )}
            </View>
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color={COLORS.textLight} />
            </View>
          </TouchableOpacity>

          <View style={styles.profileTextContainer}>
            <Text style={styles.profileTitle}>
              {displayName || 'ผู้ใช้งาน'}
            </Text>
            <Text style={styles.profileEmail}>
              {userEmail || user?.email || 'ไม่มีอีเมล'}
            </Text>
            {studentId ? (
              <Text style={{ fontSize: 12, color: COLORS.primary, marginTop: 2, fontWeight: '500' }}>
                รหัสประจำตัว: {studentId}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Display Name Info & Edit */}
        <TouchableOpacity style={styles.itemRow} onPress={handleOpenEditName} activeOpacity={0.8}>
          <View style={styles.itemLeftGroup}>
            <View style={styles.itemIconBox}>
              <Ionicons name="person-outline" size={20} color={COLORS.primary} />
            </View>
            <View>
              <Text style={styles.label}>
                ชื่อผู้ใช้งาน
              </Text>
              <Text style={styles.value}>
                {displayName || 'ยังไม่ได้ตั้งชื่อ'}
              </Text>
            </View>
          </View>

          <View style={styles.editBadge}>
            <Ionicons
              name="create-outline"
              size={18}
              color={COLORS.primary}
            />
            <Text style={styles.editText}>แก้ไข</Text>
          </View>
        </TouchableOpacity>

        {/* Student ID Info & Edit */}
        <TouchableOpacity style={styles.itemRow} onPress={handleOpenEditStudentId} activeOpacity={0.8}>
          <View style={styles.itemLeftGroup}>
            <View style={styles.itemIconBox}>
              <Ionicons name="id-card-outline" size={20} color={COLORS.primary} />
            </View>
            <View>
              <Text style={styles.label}>
                รหัสประจำตัว
              </Text>
              <Text style={styles.value}>
                {studentId || 'ยังไม่ได้ระบุ'}
              </Text>
            </View>
          </View>

          <View style={styles.editBadge}>
            <Ionicons
              name="create-outline"
              size={18}
              color={COLORS.primary}
            />
            <Text style={styles.editText}>แก้ไข</Text>
          </View>
        </TouchableOpacity>

        {/* Email Info (Read-only) */}
        <View style={styles.itemRow}>
          <View style={styles.itemLeftGroup}>
            <View style={styles.itemIconBox}>
              <Ionicons name="mail-outline" size={20} color={COLORS.primary} />
            </View>
            <View>
              <Text style={styles.label}>
                อีเมลบัญชี
              </Text>
              <Text style={styles.value}>
                {userEmail || user?.email || 'ไม่มีอีเมล'}
              </Text>
            </View>
          </View>
        </View>

        {/* Password Reset */}
        <TouchableOpacity style={styles.itemRow} onPress={handleChangePassword} activeOpacity={0.8}>
          <View style={styles.itemLeftGroup}>
            <View style={styles.itemIconBox}>
              <Ionicons name="key-outline" size={20} color={COLORS.primary} />
            </View>
            <View>
              <Text style={styles.label}>
                รหัสผ่าน
              </Text>
              <Text style={styles.value}>
                ••••••••
              </Text>
            </View>
          </View>

          <View style={styles.editBadge}>
            <Ionicons
              name="create-outline"
              size={18}
              color={COLORS.primary}
            />
            <Text style={styles.editText}>เปลี่ยน</Text>
          </View>
        </TouchableOpacity>


        {/* Logout */}
        <TouchableOpacity
          style={styles.logout}
          onPress={handleLogout}
          activeOpacity={0.85}
        >

          <Ionicons
            name="log-out-outline"
            size={22}
            color={COLORS.error}
          />
          <Text style={styles.logoutText}>
            ออกจากระบบ
          </Text>
        </TouchableOpacity>
      </View>

      {/* Edit Name Modal */}
      <Modal
        visible={isEditingName}
        transparent
        animationType="fade"
        onRequestClose={() => setIsEditingName(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>แก้ไขชื่อผู้ใช้งาน</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="กรอกชื่อผู้ใช้งานใหม่ (ภาษาไทย/อังกฤษ)"
              placeholderTextColor={COLORS.slate}
              value={tempName}
              onChangeText={(text) => setTempName(text.replace(/[^a-zA-Z\u0E00-\u0E7F\s]/g, ''))}
              autoFocus
            />

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setIsEditingName(false)}
              >
                <Text style={styles.modalCancelText}>ยกเลิก</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={handleSaveName}
              >
                <Text style={styles.modalSaveText}>บันทึก</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Student ID Modal */}
      <Modal
        visible={isEditingStudentId}
        transparent
        animationType="fade"
        onRequestClose={() => setIsEditingStudentId(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>แก้ไขรหัสประจำตัว</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="กรอกรหัสประจำตัว (ตัวเลข 10 หลัก)"
              placeholderTextColor={COLORS.slate}
              value={tempStudentId}
              onChangeText={(text) => setTempStudentId(text.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={10}
              autoFocus
            />

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setIsEditingStudentId(false)}
              >
                <Text style={styles.modalCancelText}>ยกเลิก</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={handleSaveStudentId}
              >
                <Text style={styles.modalSaveText}>บันทึก</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Loading Overlay */}

      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>{loadingText}</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },

  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textLight,
  },

  content: {
    padding: 20,
  },

  profileCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },

  avatarContainer: {
    position: 'relative',
    marginRight: 15,
  },

  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.secondary,
    overflow: 'hidden',
  },

  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
  },

  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: COLORS.primary,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },

  profileTextContainer: {
    flex: 1,
  },

  profileTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },

  profileEmail: {
    fontSize: 14,
    color: COLORS.slate,
    marginTop: 2,
  },

  item: {
    backgroundColor: COLORS.surface,
    padding: 16,
    marginBottom: 12,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },

  itemIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },

  itemTextContainer: {
    flex: 1,
  },

  itemRow: {
    backgroundColor: COLORS.surface,
    padding: 16,
    marginBottom: 12,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },

  itemLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  editBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },

  editText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },

  label: {
    color: COLORS.slate,
    fontSize: 12,
    fontWeight: '500',
  },

  value: {
    fontSize: 16,
    marginTop: 2,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },

  logout: {
    backgroundColor: COLORS.errorBackground,
    padding: 16,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#F8BBD0',
    ...SHADOWS.small,
  },

  logoutText: {
    color: COLORS.error,
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  modalCard: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    ...SHADOWS.large,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },

  modalInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
    marginBottom: 20,
  },

  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },

  modalCancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.slateLight,
  },

  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.slate,
  },

  modalSaveButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },

  modalSaveText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textLight,
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingBox: {
    backgroundColor: COLORS.surface,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
    ...SHADOWS.large,
  },

  loadingText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
});