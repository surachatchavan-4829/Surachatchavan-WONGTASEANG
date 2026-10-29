import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// นำเข้า Firebase Authentication และ Firestore
import { auth, db } from '../firebaseConfig';
import { doc, onSnapshot } from 'firebase/firestore';
import { COLORS, SHADOWS } from '../theme';

/**
 * SubjectScreen: หน้าจอศูนย์รวมการจัดการรายวิชา (Subject Dashboard / Action Hub)
 * แสดงข้อมูลภาพรวมของวิชา, สิทธิ์การใช้งาน (ผู้สร้าง / ผู้เข้าร่วม),
 * สถานะการมีเฉลย, และเมนูนำทางไปยังขั้นตอนต่างๆ:
 * - ขั้นตอนที่ 1: ถ่ายรูปเฉลย (Scan Answer Key)
 * - ขั้นตอนที่ 2: ถ่ายกระดาษนักเรียน (Scan Student Sheet)
 * - จัดการเฉลยประจำวิชา (Answer Key Screen)
 * - รายงานผลคะแนน (Score Screen)
 * @param {object} route - รับพารามิเตอร์ข้อมูลวิชาที่ส่งมา (route.params.subject)
 * @param {object} navigation - อ็อบเจกต์สำหรับสั่งการนำทางไปยังหน้าจออื่น
 */
export default function SubjectScreen({ route, navigation }) {
  // รับข้อมูลวิชาตั้งต้นที่ส่งมาจากหน้ารายการวิชา (HomeScreen)
  const initialSubject = route.params?.subject || {};
  const [subjectData, setSubjectData] = useState(initialSubject);

  /**
   * Effect: ติดตามการเปลี่ยนแปลงของเอกสารวิชาใน Firestore แบบ Real-time (onSnapshot)
   * เพื่อให้อัปเดตสถานะเฉลย, ชื่อวิชา หรือชื่อผู้สอนทันทีเมื่อมีการแก้ไข
   */
  useEffect(() => {
    if (!initialSubject?.id) return;
    const unsub = onSnapshot(doc(db, 'subjects', initialSubject.id), (snapshot) => {
      if (snapshot.exists()) {
        setSubjectData({ id: snapshot.id, ...snapshot.data() });
      }
    });
    return unsub;
  }, [initialSubject?.id]);

  // ตรวจสอบว่าผู้ใช้ปัจจุบันเป็นเจ้าของ/ผู้สร้างวิชานี้หรือไม่
  const isOwner = !subjectData?.owner || subjectData?.owner === auth.currentUser?.uid;
  // ตรวจสอบว่าวิชานี้มีการบันทึกเฉลยไว้แล้วหรือไม่
  const hasAnswerKey = subjectData?.answerKey && Object.keys(subjectData.answerKey).length > 0;
  // จำนวนข้อที่มีเฉลย
  const keyCount = hasAnswerKey ? Object.keys(subjectData.answerKey).length : 0;

  /**
   * handleOwnerOnlyAction: ตรวจสอบสิทธิ์เฉพาะผู้สร้างวิชา
   * หากเป็นผู้เข้าร่วมทั่วไป จะแสดง Alert แจ้งว่ามีสิทธิ์ดูเฉพาะรายงานคะแนนเท่านั้น
   */
  const handleOwnerOnlyAction = (actionCallback) => {
    if (!isOwner) {
      Alert.alert(
        "สิทธิ์ไม่เพียงพอ",
        "เฉพาะผู้สร้างรายวิชานี้เท่านั้นที่สามารถถ่ายรูปเฉลย ตรวจกระดาษคำตอบ หรือจัดการเฉลยได้\n(คุณมีสิทธิ์ดูรายงานผลคะแนนเท่านั้น)"
      );
      return;
    }
    actionCallback();
  };

  /**
   * handleScanStudent: การนำทางไปยังหน้าถ่ายตรวจกระดาษคำตอบนักเรียน
   * มีเงื่อนไข: หากวิชานี้ยังไม่มีเฉลย จะขึ้นเตือนให้ถ่ายรูปเฉลยก่อนตรวจนักเรียน
   */
  const handleScanStudent = () => {
    if (!hasAnswerKey) {
      Alert.alert(
        "ยังไม่มีเฉลยวิชานี้",
        "กรุณาถ่ายรูปเฉลยก่อนเพื่อใช้เป็นเกณฑ์ในการตรวจคะแนนนักเรียน",
        [
          { text: "ยกเลิก", style: "cancel" },
          { 
            text: "ถ่ายรูปเฉลยเลย", 
            onPress: () => navigation.navigate('Scan', { subject: subjectData, mode: 'answer_key' }) 
          }
        ]
      );
    } else {
      // มีเฉลยแล้ว -> เปิดกล้องโหมดตรวจกระดาษนักเรียน (student mode)
      navigation.navigate('Scan', { subject: subjectData, mode: 'student' });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* ตั้งค่าสีแถบสถานะด้านบน */}
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* ===== 1. แถบหัวข้อด้านบน (Top Header Bar) ===== */}
      <View style={styles.topHeader}>
        {/* ปุ่มย้อนกลับ */}
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.textLight} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>รายละเอียดวิชา</Text>
        {/* ปุ่มไอคอนดินสอแก้ไขข้อมูลวิชา (แสดงเฉพาะเจ้าของวิชา) */}
        {isOwner ? (
          <TouchableOpacity
            style={styles.editHeaderBtn}
            onPress={() => navigation.navigate('Add', { subjectToEdit: subjectData })}
          >
            <Ionicons name="create-outline" size={22} color={COLORS.textLight} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* ===== 2. แบนเนอร์แสดงข้อมูลรายวิชา (Hero Banner) ===== */}
      <View style={styles.heroBanner}>
        {/* แถวป้าย Badge: รหัสวิชา, สถานะเฉลย, และสิทธิ์บทบาท */}
        <View style={styles.heroBadgeRow}>
          {/* ป้ายรหัสวิชา */}
          <View style={styles.codeBadge}>
            <Text style={styles.codeText}>{subjectData?.subjectCode || '-'}</Text>
          </View>

          {/* ป้ายแสดงสถานะเฉลย (มีเฉลยแล้ว / ยังไม่มีเฉลย) */}
          <View style={[styles.statusBadge, hasAnswerKey ? styles.statusBadgeDone : styles.statusBadgePending]}>
            <Ionicons 
              name={hasAnswerKey ? "checkmark-circle" : "alert-circle"} 
              size={14} 
              color={hasAnswerKey ? COLORS.primaryDark : COLORS.error} 
            />
            <Text style={[styles.statusBadgeText, { color: hasAnswerKey ? COLORS.primaryDark : COLORS.error }]}>
              {hasAnswerKey ? `มีเฉลยแล้ว (${keyCount} ข้อ)` : 'ยังไม่มีเฉลย'}
            </Text>
          </View>

          {/* ป้ายระบุบทบาทสิทธิ์ (ผู้สร้างรายวิชา / ผู้เข้าร่วม) */}
          <View style={[styles.roleBadge, isOwner ? styles.roleBadgeOwner : styles.roleBadgeJoined]}>
            <Ionicons 
              name={isOwner ? "key" : "eye"} 
              size={12} 
              color={isOwner ? COLORS.primaryDark : COLORS.brown} 
            />
            <Text style={[styles.roleBadgeText, { color: isOwner ? COLORS.primaryDark : COLORS.brown }]}>
              {isOwner ? 'ผู้สร้างรายวิชา' : 'ผู้เข้าร่วม (ดูคะแนน)'}
            </Text>
          </View>
        </View>

        {/* ชื่อรายวิชาตัวใหญ่ */}
        <Text style={styles.titleText}>{subjectData?.subjectName}</Text>

        {/* ชื่ออาจารย์ผู้สอน */}
        <View style={styles.teacherRow}>
          <Ionicons name="person-outline" size={15} color={COLORS.secondary} />
          <Text style={styles.teacherText}>ผู้สอน: {subjectData?.teacher || subjectData?.ownerName || 'ผู้สร้าง'}</Text>
        </View>
      </View>

      {/* ===== 3. รายการเมนูการทำงาน (Action Cards Container) ===== */}
      <View style={styles.menuContainer}>
        {isOwner && (
          <>
            {/* เมนูที่ 1: ขั้นตอนที่ 1 ถ่ายรูปเฉลย (Answer Key Mode) */}
            <TouchableOpacity
              style={[styles.card, { borderColor: COLORS.yellow }]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Scan', { subject: subjectData, mode: 'answer_key' })}
            >
              <View style={[styles.iconBox, { backgroundColor: COLORS.brownLight }]}>
                <Ionicons name="key-outline" size={30} color={COLORS.brown} />
              </View>

              <View style={styles.cardTextContainer}>
                <View style={styles.stepHeader}>
                  <Text style={styles.stepTag}>ขั้นตอนที่ 1</Text>
                </View>
                <Text style={styles.cardTitle}>ถ่ายรูปเฉลย (Answer Key)</Text>
                <Text style={styles.cardSubtitle}>
                  {hasAnswerKey ? `บันทึกเฉลยแล้ว (${keyCount} ข้อ) กดเพื่อถ่ายเฉลยใหม่` : 'ถ่ายรูปกระดาษเฉลยเพื่อถอดเฉลยให้อัตโนมัติ'}
                </Text>
              </View>

              <Ionicons name="camera" size={22} color={COLORS.brown} />
            </TouchableOpacity>

            {/* เมนูที่ 2: ขั้นตอนที่ 2 ถ่ายกระดาษนักเรียน (Student Mode) */}
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={handleScanStudent}
            >
              <View style={[styles.iconBox, { backgroundColor: COLORS.primaryLight }]}>
                <Ionicons name="scan-outline" size={30} color={COLORS.primary} />
              </View>

              <View style={styles.cardTextContainer}>
                <View style={styles.stepHeader}>
                  <Text style={[styles.stepTag, { backgroundColor: COLORS.primaryLight, color: COLORS.primary }]}>ขั้นตอนที่ 2</Text>
                </View>
                <Text style={styles.cardTitle}>ถ่ายกระดาษนักเรียน</Text>
                <Text style={styles.cardSubtitle}>ถ่ายรูปกระดาษคำตอบของนักเรียนเพื่อตรวจคะแนน</Text>
              </View>

              <Ionicons name="chevron-forward" size={22} color={COLORS.slate} />
            </TouchableOpacity>

            {/* เมนูที่ 3: จัดการเฉลยประจำวิชา (สร้าง/แก้ไขเฉลยด้วยตนเอง) */}
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('AnswerKey', { subject: subjectData })}
            >
              <View style={[styles.iconBox, { backgroundColor: COLORS.secondaryLight }]}>
                <Ionicons name="list-outline" size={30} color={COLORS.primaryDark} />
              </View>

              <View style={styles.cardTextContainer}>
                <Text style={styles.cardTitle}>จัดการเฉลยประจำวิชา</Text>
                <Text style={styles.cardSubtitle}>ดูและแก้ไขเฉลยคำตอบรายข้อด้วยตัวเอง</Text>
              </View>

              <Ionicons name="chevron-forward" size={22} color={COLORS.slate} />
            </TouchableOpacity>
          </>
        )}

        {/* เมนูที่ 4: รายงานผลคะแนน (เปิดให้ทั้งเจ้าของและผู้เข้าร่วมดูได้) */}
        <TouchableOpacity
          style={[styles.card, !isOwner && styles.activeScoreCard]}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Score', { subject: subjectData })}
        >
          <View style={[styles.iconBox, { backgroundColor: COLORS.primaryLight }]}>
            <Ionicons name="bar-chart-outline" size={30} color={COLORS.primary} />
          </View>

          <View style={styles.cardTextContainer}>
            <Text style={[styles.cardTitle, { color: COLORS.primary }]}>รายงานผลคะแนน</Text>
            <Text style={styles.cardSubtitle}>ดูสรุปผลคะแนนและสถิติการสอบของวิชานี้</Text>
          </View>

          <Ionicons name="chevron-forward" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ===== สไตล์การตกแต่งหน้าจอ (StyleSheet) =====
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },

  // แถบ Header ด้านบน
  topHeader: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // ปุ่มย้อนกลับ
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ปุ่มดินสอแก้ไขวิชา
  editHeaderBtn: {
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

  // แบนเนอร์แสดงข้อมูลวิชาส่วนบน โค้งมนด้านล่าง
  heroBanner: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 10,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    ...SHADOWS.medium,
  },

  // แถวรวมป้าย Badge
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },

  // ป้ายรหัสวิชา
  codeBadge: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },

  codeText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.primaryDark,
  },

  // ป้ายแสดงสถานะเฉลย
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },

  statusBadgeDone: {
    backgroundColor: COLORS.secondaryLight,
  },

  statusBadgePending: {
    backgroundColor: COLORS.errorBackground,
  },

  statusBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },

  // ป้ายแสดงสิทธิ์บทบาท
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },

  roleBadgeOwner: {
    backgroundColor: COLORS.secondaryLight,
  },

  roleBadgeJoined: {
    backgroundColor: COLORS.brownLight,
  },

  roleBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },

  // ชื่อวิชาขนาดใหญ่
  titleText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textLight,
    marginBottom: 6,
  },

  // ข้อมูลอาจารย์ผู้สอน
  teacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  teacherText: {
    fontSize: 14,
    color: COLORS.secondary,
    fontWeight: '500',
  },

  // กล่องรวมการ์ดเมนูการทำงาน
  menuContainer: {
    padding: 16,
    gap: 12,
  },

  // สไตล์การ์ดเมนูแต่ละใบ
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },

  disabledCard: {
    opacity: 0.6,
    backgroundColor: '#FAFBFB',
    borderColor: COLORS.border,
  },

  // การ์ดรายงานผลคะแนนเมื่ออยู่ในโหมดผู้เข้าร่วม
  activeScoreCard: {
    borderColor: COLORS.primary,
    borderWidth: 2,
    ...SHADOWS.medium,
  },

  // กล่องสี่เหลี่ยมไอคอนนำหน้า
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },

  cardTextContainer: {
    flex: 1,
  },

  stepHeader: {
    marginBottom: 2,
  },

  // ป้ายระบุขั้นตอน เช่น "ขั้นตอนที่ 1", "ขั้นตอนที่ 2"
  stepTag: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.brown,
    backgroundColor: COLORS.brownLight,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },

  cardSubtitle: {
    fontSize: 12,
    color: COLORS.slate,
  },
});