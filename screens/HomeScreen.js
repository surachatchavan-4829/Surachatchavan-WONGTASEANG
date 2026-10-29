import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
  FlatList,
  Alert,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';

// นำเข้า Firebase Authentication และ Firestore
import { auth, db } from '../firebaseConfig';
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  getDocs,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';

// นำเข้าธีมสีและสไตล์เงา
import { COLORS, SHADOWS } from '../theme';

/**
 * HomeScreen: หน้าจอหลักของแอปพลิเคชัน (แดชบอร์ดรายวิชา)
 * แสดงรายการวิชาทั้งหมดที่ผู้ใช้เป็นเจ้าของ หรือได้เข้าร่วมไว้,
 * มีปุ่มสร้างวิชาใหม่ (FAB +), ปุ่มเข้าร่วมวิชาด้วยรหัสวิชา, และเมนูจัดการวิชา
 */
export default function HomeScreen({ navigation }) {
  // ===== State สำหรับเก็บข้อมูลรายวิชาและผู้ใช้งาน =====
  const [subjects, setSubjects] = useState([]);                                // รายการวิชาทั้งหมดที่โหลดจาก Firestore
  const [user, setUser] = useState(auth.currentUser);                          // ข้อมูลผู้ใช้ปัจจุบัน
  const [profilePhoto, setProfilePhoto] = useState(auth.currentUser?.photoURL || null); // รูปโปรไฟล์ของผู้ใช้
  const [profileName, setProfileName] = useState(auth.currentUser?.displayName || '');  // ชื่อที่แสดงของผู้ใช้
  const [avatarLoadError, setAvatarLoadError] = useState(false);              // ดักจับกรณีโหลดรูปโปรไฟล์ไม่สำเร็จ
  
  // ===== State สำหรับ Modal "เข้าร่วมรายวิชา" =====
  const [isJoinModalVisible, setIsJoinModalVisible] = useState(false);        // ควบคุมการเปิด/ปิด Modal เข้าร่วมวิชา
  const [joinCodeInput, setJoinCodeInput] = useState('');                      // ข้อความรหัสวิชาที่พิมพ์
  const [joining, setJoining] = useState(false);                               // สถานะกำลังตรวจสอบ/เข้าร่วมวิชา

  // ตรวจจับว่าหน้านี้กำลังโฟกัสอยู่หรือไม่
  const isFocused = useIsFocused();

  /**
   * Effect ที่ 1: โหลดและซิงก์ข้อมูลโปรไฟล์ล่าสุดของผู้ใช้จาก Firestore (collection: users)
   * ทำงานทุกครั้งที่ผู้ใช้สลับกลับมาที่หน้านี้ (isFocused) เพื่อให้อัปเดตรูป/ชื่อโปรไฟล์ล่าสุดเสมอ
   */
  useEffect(() => {
    if (!auth.currentUser) return;
    setUser({ ...auth.currentUser });
    if (auth.currentUser.photoURL) {
      setProfilePhoto(auth.currentUser.photoURL);
      setAvatarLoadError(false);
    }
    if (auth.currentUser.displayName) {
      setProfileName(auth.currentUser.displayName);
    }

    // ฟังก์ชันดึงรูปโปรไฟล์และชื่อจาก Firestore เพื่อรองรับการย้ายเครื่องหรืออัปเดตใหม่
    const fetchUserProfile = async () => {
      try {
        if (auth.currentUser) {
          auth.currentUser.reload().catch(() => {});
        }
        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.photoURL) {
            setProfilePhoto(data.photoURL);
            setAvatarLoadError(false);
          }
          if (data.displayName) {
            setProfileName(data.displayName);
          }
        }
      } catch (e) {
        console.warn('Fetch user profile error:', e.message);
      }
    };

    fetchUserProfile();
  }, [isFocused]);

  /**
   * Effect ที่ 2: Real-time Listener (onSnapshot) สำหรับรับการเปลี่ยนแปลงของรายวิชา
   * กรองวิชาที่จะแสดงผล:
   * 1. วิชาที่ตนเองเป็นเจ้าของ (isOwner)
   * 2. วิชาที่มี UID ของตนเองอยู่ใน joinedUsers (isJoined)
   */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'subjects'),
      (snapshot) => {
        const list = [];
        const currentUid = auth.currentUser?.uid;

        snapshot.forEach((document) => {
          const data = document.data();
          const isOwner = !data.owner || data.owner === currentUid;
          const isJoined = Array.isArray(data.joinedUsers) && data.joinedUsers.includes(currentUid);

          // แสดงวิชาที่เป็นเจ้าของ หรือเพิ่มตนเองเป็นผู้เข้าร่วม
          if (isOwner || isJoined) {
            list.push({
              id: document.id,
              ...data,
            });
          }
        });

        // อัปเดตรายการวิชาลงใน State
        setSubjects(list);
      }
    );

    // คืนฟังก์ชัน unsubscribe เมื่อ component unmount
    return unsubscribe;
  }, []);

  /**
   * handleJoinSubject: ฟังก์ชันเข้าร่วมรายวิชาผ่านรหัสวิชา (Subject Code)
   * - ค้นหารายวิชาใน Firestore ด้วย subjectCode
   * - เพิ่ม UID ของผู้ใช้ปัจจุบันเข้าไปในฟิลด์ joinedUsers ของวิชานั้น (สิทธิ์ดูคะแนนอย่างเดียว)
   */
  const handleJoinSubject = async () => {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) {
      Alert.alert('แจ้งเตือน', 'กรุณากรอกรหัสวิชา');
      return;
    }

    try {
      setJoining(true);
      // ค้นหารายวิชาที่รหัสตรงกัน
      const q = query(collection(db, 'subjects'), where('subjectCode', '==', code));
      const querySnap = await getDocs(q);

      if (querySnap.empty) {
        Alert.alert('ไม่พบรายวิชา', `ไม่พบรายวิชาที่มีรหัส "${code}" ในระบบ`);
        return;
      }

      const currentUid = auth.currentUser.uid;
      let targetDoc = null;
      querySnap.forEach(d => { targetDoc = { id: d.id, ...d.data() }; });

      // หากเป็นเจ้าของวิชาอยู่แล้ว ไม่จำเป็นต้องเข้าร่วมซ้ำ
      if (targetDoc.owner === currentUid) {
        Alert.alert('แจ้งเตือน', 'คุณเป็นผู้สร้างรายวิชานี้อยู่แล้ว');
        setIsJoinModalVisible(false);
        setJoinCodeInput('');
        return;
      }

      // เพิ่ม UID เข้า array joinedUsers ด้วย arrayUnion
      const docRef = doc(db, 'subjects', targetDoc.id);
      await updateDoc(docRef, {
        joinedUsers: arrayUnion(currentUid),
      });

      Alert.alert('สำเร็จ', `เข้าร่วมรายวิชา "${targetDoc.subjectName}" เรียบร้อยแล้ว (สิทธิ์ดูคะแนนอย่างเดียว)`);
      setIsJoinModalVisible(false);
      setJoinCodeInput('');
    } catch (error) {
      console.error('Join subject error:', error);
      Alert.alert('เกิดข้อผิดพลาด', error.message);
    } finally {
      setJoining(false);
    }
  };

  /**
   * handleSubjectOptions: เมนูจัดการวิชาเมื่อกดปุ่มสามจุด (Ellipsis) บนการ์ด
   * - กรณีเป็นเจ้าของ (Owner): สามารถเลือก "แก้ไขรายวิชา" หรือ "ลบรายวิชา"
   * - กรณีเป็นผู้เข้าร่วม (Joined): สามารถเลือก "ออกจากรายวิชา"
   * @param {object} item - ข้อมูลรายวิชาที่ถูกเลือก
   */
  const handleSubjectOptions = (item) => {
    const currentUid = auth.currentUser?.uid;
    const isOwner = !item.owner || item.owner === currentUid;

    if (isOwner) {
      // เมนูสำหรับผู้สร้างรายวิชา
      Alert.alert(
        'จัดการรายวิชา (ผู้สร้าง)',
        `เลือกรายการที่ต้องการสำหรับวิชา "${item.subjectName}"`,
        [
          { text: 'ยกเลิก', style: 'cancel' },
          {
            text: 'แก้ไขรายวิชา',
            onPress: () => navigation.navigate('Add', { subjectToEdit: item }),
          },
          {
            text: 'ลบรายวิชา',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteDoc(doc(db, 'subjects', item.id));
                Alert.alert('สำเร็จ', 'ลบรายวิชาเรียบร้อย');
              } catch (error) {
                Alert.alert('เกิดข้อผิดพลาด', error.message);
              }
            },
          },
        ]
      );
    } else {
      // เมนูสำหรับผู้เข้าร่วมรายวิชา
      Alert.alert(
        'จัดการรายวิชา (ผู้เข้าร่วม)',
        `ต้องการออกจากรายวิชา "${item.subjectName}" หรือไม่?`,
        [
          { text: 'ยกเลิก', style: 'cancel' },
          {
            text: 'ออกจากวิชา',
            style: 'destructive',
            onPress: async () => {
              try {
                // ลบ UID ออกจาก array joinedUsers ด้วย arrayRemove
                await updateDoc(doc(db, 'subjects', item.id), {
                  joinedUsers: arrayRemove(currentUid),
                });
                Alert.alert('สำเร็จ', 'ออกจากรายวิชาเรียบร้อย');
              } catch (error) {
                Alert.alert('เกิดข้อผิดพลาด', error.message);
              }
            },
          },
        ]
      );
    }
  };

  /**
   * renderItem: ฟังก์ชันวาดการ์ดแสดงผลแต่ละรายวิชา (Subject Card) ใน FlatList
   * แสดง: แถบสีไฮไลต์, ป้ายรหัสวิชา, ป้ายสิทธิ์ (ผู้สร้าง/ดูคะแนน), ชื่อวิชา, ชื่อผู้สอน, และปุ่มสามจุด
   */
  const renderItem = ({ item }) => {
    const currentUid = auth.currentUser?.uid;
    const isOwner = !item.owner || item.owner === currentUid;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() =>
          // กดการ์ดเพื่อเปิดหน้ารายละเอียดวิชา (SubjectScreen)
          navigation.navigate('Subject', {
            subject: item,
          })
        }
      >
        {/* แถบสีด้านซ้ายของการ์ด: สีหลักถ้าเป็นเจ้าของ, สีรองถ้าเป็นผู้เข้าร่วม */}
        <View style={[styles.cardAccentBar, !isOwner && { backgroundColor: COLORS.secondary }]} />

        <View style={styles.cardTextContainer}>
          <View style={styles.badgeRow}>
            {/* ป้ายแสดงรหัสวิชา */}
            <View style={styles.codeBadge}>
              <Text style={styles.subjectCode}>{item.subjectCode}</Text>
            </View>

            {/* ป้ายแสดงสถานะสิทธิ์ (ผู้สร้าง / ดูคะแนนเท่านั้น) */}
            <View style={[styles.roleBadge, isOwner ? styles.roleBadgeOwner : styles.roleBadgeJoined]}>
              <Ionicons
                name={isOwner ? "key-outline" : "eye-outline"}
                size={11}
                color={isOwner ? COLORS.primaryDark : COLORS.brown}
              />
              <Text style={[styles.roleBadgeText, { color: isOwner ? COLORS.primaryDark : COLORS.brown }]}>
                {isOwner ? 'ผู้สร้าง' : 'ดูคะแนนเท่านั้น'}
              </Text>
            </View>
          </View>

          {/* ชื่อรายวิชา */}
          <Text style={styles.cardTitle}>{item.subjectName}</Text>

          {/* ชื่ออาจารย์ผู้สอน */}
          <View style={styles.teacherRow}>
            <Ionicons name="person-outline" size={14} color={COLORS.brown} />
            <Text style={styles.cardSubtitle}>ผู้สอน: {item.teacher || item.ownerName || 'ผู้สร้าง'}</Text>
          </View>
        </View>

        {/* ปุ่มจุดสามจุดสำหรับเปิดเมนูจัดการวิชา */}
        <TouchableOpacity
          style={styles.moreButton}
          onPress={(e) => {
            e.stopPropagation(); // ป้องกันการกดทะลุไปเปิด SubjectScreen
            handleSubjectOptions(item);
          }}
        >
          <Ionicons
            name="ellipsis-vertical"
            size={22}
            color={COLORS.slate}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* แถบสถานะด้านบน */}
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* ===== 1. แถบหัวข้อด้านบน (Header Bar) ===== */}
      <View style={styles.header}>
        <View style={styles.userInfoRow}>
          {/* รูปโปรไฟล์กลม กดเพื่อไปหน้า Setting */}
          <TouchableOpacity
            style={styles.avatarHeaderCircle}
            onPress={() => navigation.navigate('Setting')}
            activeOpacity={0.85}
          >
            {profilePhoto && !avatarLoadError ? (
              <Image 
                source={{ uri: profilePhoto }} 
                style={styles.avatarHeaderImage} 
                onError={() => setAvatarLoadError(true)}
              />
            ) : (
              <Ionicons name="person" size={22} color={COLORS.primary} />
            )}
          </TouchableOpacity>

          {/* ข้อความต้อนรับและชื่อผู้ใช้ */}
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>
              {profileName || user?.displayName || 'รายวิชาทั้งหมด'}
            </Text>
            <Text style={styles.headerSubtitle}>ระบบตรวจข้อสอบ OMR</Text>
          </View>
        </View>

        {/* ปุ่ม "เข้ารายวิชา" สำหรับกรอกรหัสวิชา */}
        <TouchableOpacity
          style={styles.joinHeaderBtn}
          onPress={() => setIsJoinModalVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="enter-outline" size={18} color={COLORS.primaryDark} />
          <Text style={styles.joinHeaderBtnText}>เข้ารายวิชา</Text>
        </TouchableOpacity>

        {/* ปุ่มไปหน้าตั้งค่า (Settings) */}
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Setting')}
        >
          <Ionicons
            name="settings-outline"
            size={22}
            color={COLORS.textLight}
          />
        </TouchableOpacity>
      </View>

      {/* ===== 2. พื้นที่แสดงรายการวิชา (Main Content / FlatList) ===== */}
      <View style={styles.mainContainer}>
        <FlatList
          data={subjects}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          // แสดงข้อความและไอคอนเมื่อยังไม่มีวิชาใดๆ
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="book-outline" size={48} color={COLORS.slate} />
              </View>
              <Text style={styles.emptyTitle}>ยังไม่มีรายวิชา</Text>
              <Text style={styles.emptyText}>กดปุ่ม + เพื่อสร้างวิชาใหม่ หรือกด "เข้ารายวิชา" เพื่อดูคะแนน</Text>
            </View>
          }
        />

        {/* ===== 3. ปุ่มบวกสร้างวิชาใหม่แบบลอยตัว (FAB - Floating Action Button) ===== */}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('Add')} // นำทางไปหน้า AddScreen
          activeOpacity={0.8}
        >
          <Ionicons
            name="add"
            size={36}
            color={COLORS.primary}
          />
        </TouchableOpacity>
      </View>

      {/* ===== 4. Modal ป๊อปอัปสำหรับเข้าร่วมรายวิชาด้วยรหัส ===== */}
      <Modal
        visible={isJoinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsJoinModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Ionicons name="enter-outline" size={24} color={COLORS.primary} />
              <Text style={styles.modalTitle}>เข้าร่วมรายวิชา</Text>
            </View>
            <Text style={styles.modalSubtitle}>กรอกรหัสวิชา (เช่น CS101) เพื่อเข้าร่วมและดูผลคะแนน</Text>

            {/* ช่องกรอกรหัสวิชา */}
            <TextInput
              style={styles.modalInput}
              placeholder="กรอกรหัสวิชา (Subject Code)"
              placeholderTextColor={COLORS.slate}
              value={joinCodeInput}
              onChangeText={setJoinCodeInput}
              autoCapitalize="characters"
              autoFocus
            />

            {/* ปุ่มยกเลิกและปุ่มยืนยันเข้าร่วม */}
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setIsJoinModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>ยกเลิก</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={handleJoinSubject}
                disabled={joining}
              >
                {joining ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>เข้าร่วมวิชา</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ===== สไตล์การตกแต่งหน้าจอ (StyleSheet) =====
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },

  // แถบ Header หลักด้านบน
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primaryDark,
    gap: 8,
  },

  // กลุ่มรูปโปรไฟล์และข้อความชื่อผู้ใช้
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },

  // วงกลมหุ้มรูปโปรไฟล์
  avatarHeaderCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.secondary,
    overflow: 'hidden',
  },

  avatarHeaderImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },

  headerTitleContainer: {
    flex: 1,
  },

  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.textLight,
  },

  headerSubtitle: {
    fontSize: 12,
    color: COLORS.secondary,
    fontWeight: '600',
  },

  // ปุ่มกด "เข้ารายวิชา" ด้านบน
  joinHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 4,
  },

  joinHeaderBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.primaryDark,
  },

  // ปุ่มตั้งค่า
  settingsButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // พื้นหลังหลักของคอนเทนต์
  mainContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  listContent: {
    padding: 16,
    paddingBottom: 100,
  },

  // ส่วนแสดงกรณีไม่มีรายวิชา
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    paddingHorizontal: 20,
  },

  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.slateLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },

  emptyText: {
    fontSize: 14,
    color: COLORS.slate,
    textAlign: 'center',
    lineHeight: 20,
  },

  // การ์ดแสดงผลแต่ละรายวิชา
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },

  // เส้นสีไฮไลต์แนวตั้งด้านซ้ายของการ์ด
  cardAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: COLORS.primary,
  },

  cardTextContainer: {
    flex: 1,
    paddingLeft: 8,
  },

  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },

  // ป้ายแสดงรหัสวิชา
  codeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.secondaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.secondary,
  },

  subjectCode: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },

  // ป้ายแสดงสิทธิ์ในรายวิชา
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },

  roleBadgeOwner: {
    backgroundColor: COLORS.primaryLight,
  },

  roleBadgeJoined: {
    backgroundColor: COLORS.brownLight,
  },

  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ข้อความชื่อวิชา
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },

  teacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },

  cardSubtitle: {
    fontSize: 14,
    color: COLORS.brown,
    fontWeight: '500',
  },

  // ปุ่มสามจุดเมนูเพิ่มเติม
  moreButton: {
    padding: 8,
  },

  // ปุ่มบวก FAB สีเหลืองทองลอยตัว
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.yellow,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: COLORS.yellowDark,
    ...SHADOWS.large,
  },

  // แบ็กกราวด์มืดด้านหลัง Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  // กล่องการ์ด Modal เข้าร่วมวิชา
  modalCard: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    ...SHADOWS.large,
  },

  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },

  modalSubtitle: {
    fontSize: 13,
    color: COLORS.slate,
    marginBottom: 16,
  },

  // ช่องกรอกรหัสวิชาใน Modal
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
});