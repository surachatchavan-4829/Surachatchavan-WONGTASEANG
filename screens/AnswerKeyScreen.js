import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  StatusBar, Platform, ScrollView, Alert, ActivityIndicator 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// นำเข้าโมดูล Firebase Firestore
import { db, auth } from '../firebaseConfig';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

// นำเข้าธีมสีและการตั้งค่า Server URL
import { COLORS, SHADOWS } from '../theme';
import { getServerUrl } from '../serverConfig';

// รายการตัวเลือก 5 ตัวเลือก (1 ถึง 5) สำหรับกระดาษคำตอบ OMR
const CHOICES = ['1', '2', '3', '4', '5'];

/**
 * AnswerKeyScreen: หน้าจอสำหรับ "สร้างและจัดการเฉลยข้อสอบประจำวิชา"
 * สามารถกำหนดตัวเลือกได้ด้วยตนเอง (คลิกเลือก), ถ่ายรูปเฉลยผ่าน AI,
 * เพิ่ม/ลดจำนวนข้อสอบ และบันทึกซิงก์ทั้ง Firestore และ FastAPI Server
 */
export default function AnswerKeyScreen({ route, navigation }) {
  // รับข้อมูลรายวิชา (subject) และ Server URL ที่ส่งมาจากหน้าก่อนหน้า
  const { subject, defaultServerUrl } = route.params || {};

  // ===== State สถานะการทำงานของหน้าจอ =====
  const [loading, setLoading] = useState(true);            // แสดงสถานะขณะกำลังโหลดข้อมูลเฉลยเดิม
  const [saving, setSaving] = useState(false);              // แสดงสถานะขณะกำลังบันทึกข้อมูล
  const [answerKey, setAnswerKey] = useState({});          // เก็บชุดข้อมูลเฉลย เช่น { "1": "1", "2": "3", "3": "4" }
  const [totalQuestions, setTotalQuestions] = useState(25); // จำนวนข้อสอบทั้งหมดที่จะแสดงในตาราง (เริ่มต้น 25 ข้อ)

  // โหลดเฉลยที่มีอยู่เดิมทันทีที่เปิดหน้านี้ขึ้นมา
  useEffect(() => {
    fetchAnswerKey();
  }, [subject?.id]);

  /**
   * fetchAnswerKey: ดึงข้อมูลเฉลยที่เคยบันทึกไว้ใน Firestore (collection: subjects)
   * หากมีเฉลยเดิมอยู่แล้ว จะตั้งค่า totalQuestions ให้ครอบคลุมจำนวนข้อที่มีในเฉลย
   */
  const fetchAnswerKey = async () => {
    if (!subject?.id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const docRef = doc(db, 'subjects', subject.id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().answerKey) {
        const keyData = docSnap.data().answerKey;
        setAnswerKey(keyData);
        const keys = Object.keys(keyData);
        if (keys.length > 0) {
          // กำหนดจำนวนข้อขั้นต่ำ 25 ข้อ หรือตามข้อสูงสุดที่มีในเฉลย
          setTotalQuestions(Math.max(keys.length, 25));
        }
      }
    } catch (e) {
      console.error("Error fetching answer key:", e);
    } finally {
      setLoading(false);
    }
  };

  /**
   * handleChoiceChange: สลับเลือก/ยกเลิกคำตอบในข้อนั้นๆ
   * - หากกดตัวเลือกเดิมที่เลือกไว้อยู่แล้ว จะเป็นการยกเลิก (ล้างค่า)
   * - หากกดตัวเลือกใหม่ จะบันทึกค่านั้นเป็นเฉลย
   * @param {string} qNum - เลขข้อสอบในรูปแบบ String (เช่น "1", "2")
   * @param {string} choice - ตัวเลือกที่กด (เช่น "1", "2", "3", "4", "5")
   */
  const handleChoiceChange = (qNum, choice) => {
    setAnswerKey(prev => {
      const updated = { ...prev };
      if (updated[qNum] === choice) {
        delete updated[qNum]; // กดย้ำตัวเดิม = ยกเลิกการเฉลยข้อนี้
      } else {
        updated[qNum] = choice; // กำหนดตัวเลือกใหม่
      }
      return updated;
    });
  };

  /**
   * handleClearQuestion: ล้างเฉลยของข้อที่ระบุให้เป็นข้อว่าง
   * @param {string} qNum - เลขข้อที่ต้องการล้าง
   */
  const handleClearQuestion = (qNum) => {
    setAnswerKey(prev => {
      const updated = { ...prev };
      delete updated[qNum];
      return updated;
    });
  };

  /**
   * handleAddQuestions: เพิ่มจำนวนข้อสอบในตาราง
   * @param {number} count - จำนวนข้อที่ต้องการเพิ่ม (เช่น +1 หรือ +5 ข้อ)
   */
  const handleAddQuestions = (count = 1) => {
    setTotalQuestions(prev => prev + count);
  };

  /**
   * handleDeleteQuestionRow: ลบข้อสอบข้อใดข้อหนึ่งออกจากชุดข้อสอบ
   * พร้อมเลื่อนเลขข้อที่อยู่ด้านหลังขึ้นมาแทนที่ (Shift index)
   * @param {number} qNumInt - เลขข้อที่ต้องการลบ
   */
  const handleDeleteQuestionRow = (qNumInt) => {
    Alert.alert(
      "ลบข้อสอบ",
      `คุณต้องการลบ ข้อ ${qNumInt} ออกจากชุดข้อสอบหรือไม่?`,
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ลบข้อสอบ",
          style: "destructive",
          onPress: () => {
            setAnswerKey(prev => {
              const updated = {};
              // วนลูปจัดเรียงเลขข้อใหม่: ข้อที่อยู่หลังข้อที่ถูกลบ จะลดเลขข้อลง 1
              for (let i = 1; i <= totalQuestions; i++) {
                if (i < qNumInt) {
                  if (prev[String(i)]) updated[String(i)] = prev[String(i)];
                } else if (i > qNumInt) {
                  if (prev[String(i)]) updated[String(i - 1)] = prev[String(i)];
                }
              }
              return updated;
            });
            // ลดจำนวนข้อรวมลง 1 ข้อ
            setTotalQuestions(prev => Math.max(1, prev - 1));
          }
        }
      ]
    );
  };

  /**
   * handleDeleteLastQuestion: ลบข้อสอบข้อสุดท้ายออกจากตาราง
   */
  const handleDeleteLastQuestion = () => {
    if (totalQuestions <= 1) return;
    const lastQ = totalQuestions;
    setAnswerKey(prev => {
      const updated = { ...prev };
      delete updated[String(lastQ)];
      return updated;
    });
    setTotalQuestions(prev => prev - 1);
  };

  /**
   * handleSave: บันทึกเฉลยประจำวิชา
   * 1. ตรวจสอบสิทธิ์ (เฉพาะเจ้าของวิชาเท่านั้นที่แก้ไขได้)
   * 2. อัปเดตเฉลยลง Firestore ในเอกสาร subjects/{subject.id}
   * 3. ซิงก์เฉลยไปยัง FastAPI Server (/save_answer_key) เพื่อให้พร้อมใช้ตรวจสแกน
   */
  const handleSave = async () => {
    if (!subject?.id) {
      Alert.alert("ข้อผิดพลาด", "ไม่พบข้อมูลรายวิชา");
      return;
    }
    // ตรวจสอบสิทธิ์เจ้าของวิชา
    const isOwner = !subject?.owner || subject?.owner === auth.currentUser?.uid;
    if (!isOwner) {
      Alert.alert("สิทธิ์ไม่เพียงพอ", "เฉพาะผู้สร้างรายวิชาเท่านั้นที่สามารถบันทึกหรือแก้ไขเฉลยได้");
      return;
    }
    try {
      setSaving(true);
      
      // 1. บันทึกลง Firebase Firestore
      const docRef = doc(db, 'subjects', subject.id);
      await updateDoc(docRef, {
        answerKey: answerKey,
        updatedAt: new Date(),
      });

      // 2. ซิงก์เฉลยไปยัง FastAPI Server
      const serverUrl = defaultServerUrl || getServerUrl();
      try {
        await fetch(`${serverUrl.replace(/\/+$/, '')}/save_answer_key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject_id: subject.id,
            answer_key: answerKey
          })
        });
      } catch (e) {
        console.warn("Could not sync with FastAPI server:", e.message);
      }

      Alert.alert("สำเร็จ", "บันทึกเฉลยประจำวิชาเรียบร้อยแล้ว");
    } catch (e) {
      Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถบันทึกได้: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // นับจำนวนข้อที่มีการฝนเฉลยแล้ว
  const filledCount = Object.keys(answerKey).filter(k => answerKey[k]).length;

  return (
    <SafeAreaView style={styles.container}>
      {/* ตั้งค่าสีแถบสถานะด้านบน */}
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* ===== 1. แถบหัวข้อด้านบน (Top Header) ===== */}
      <View style={styles.topHeader}>
        {/* ปุ่มย้อนกลับ */}
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.textLight} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>เฉลยประจำวิชา</Text>
        {/* ปุ่มบันทึกด่วนมุมขวาบน */}
        <TouchableOpacity style={styles.saveHeaderBtn} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.saveHeaderBtnText}>บันทึก</Text>}
        </TouchableOpacity>
      </View>

      {/* ===== 2. แถบข้อมูลรายวิชาและปุ่มถ่ายรูปเฉลย (Sub Header) ===== */}
      <View style={styles.subHeader}>
        <View>
          <Text style={styles.subjectTitle}>{subject?.subjectName || 'รายวิชา'}</Text>
          <Text style={styles.subjectCode}>{subject?.subjectCode || '-'}</Text>
        </View>
        {/* ปุ่มเปิดกล้องโหมดถ่ายเฉลย (นำ AI มาสกัดเฉลยอัตโนมัติ) */}
        <TouchableOpacity
          style={styles.cameraScanBtn}
          onPress={() => navigation.navigate('Scan', { subject, mode: 'answer_key' })}
        >
          <Ionicons name="camera-outline" size={20} color="white" />
          <Text style={styles.cameraScanBtnText}>ถ่ายรูปเฉลย</Text>
        </TouchableOpacity>
      </View>

      {/* ===== 3. ตารางรายการเฉลยข้อสอบ (Answer Key Table) ===== */}
      {loading ? (
        // ขณะกำลังโหลดข้อมูลเฉลย
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ marginTop: 10, color: COLORS.slate }}>กำลังโหลดเฉลย...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* ป้ายแสดงสรุปจำนวนข้อที่เฉลยไปแล้ว */}
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} />
            <Text style={styles.infoText}>
              กำหนดเฉลย {filledCount} / {totalQuestions} ข้อ (กด ✕ ล้างเฉลย, 🗑️ ลบข้อนั้นออก)
            </Text>
          </View>

          {/* วนลูปสร้างแถวข้อสอบตั้งแต่ข้อ 1 ถึงข้อสุดท้าย (totalQuestions) */}
          {Array.from({ length: totalQuestions }, (_, i) => i + 1).map((qNum) => {
            const currentChoice = answerKey[strKey(qNum)] || '';
            return (
              <View key={qNum} style={styles.questionRow}>
                {/* ด้านซ้าย: เลขข้อ, ปุ่มล้างเฉลย, ปุ่มลบข้อ */}
                <View style={styles.qNumContainer}>
                  <Text style={styles.qNumText}>ข้อ {qNum}</Text>
                  {currentChoice ? (
                    <TouchableOpacity
                      style={styles.clearChoiceBtn}
                      onPress={() => handleClearQuestion(strKey(qNum))}
                      activeOpacity={0.7}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="close-circle-outline" size={17} color={COLORS.slate} />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.deleteRowBtn}
                    onPress={() => handleDeleteQuestionRow(qNum)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="trash-outline" size={17} color={COLORS.error} />
                  </TouchableOpacity>
                </View>

                {/* ด้านขวา: ปุ่มวงกลมตัวเลือก 1, 2, 3, 4, 5 */}
                <View style={styles.choiceGroup}>
                  {CHOICES.map((c) => {
                    const selected = currentChoice === c;
                    return (
                      <TouchableOpacity
                        key={c}
                        style={[styles.choiceBtn, selected && styles.choiceBtnSelected]}
                        onPress={() => handleChoiceChange(strKey(qNum), c)}
                      >
                        <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                          {c}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {/* ปุ่มควบคุมจัดการจำนวนข้อ (+1 ข้อ, +5 ข้อ, - ลบข้อสุดท้าย) */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity style={styles.actionAddBtn} onPress={() => handleAddQuestions(1)}>
              <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
              <Text style={styles.actionAddText}>+ เพิ่ม 1 ข้อ</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionAddBtn} onPress={() => handleAddQuestions(5)}>
              <Ionicons name="add-circle" size={18} color={COLORS.primary} />
              <Text style={styles.actionAddText}>+ เพิ่ม 5 ข้อ</Text>
            </TouchableOpacity>

            {totalQuestions > 1 && (
              <TouchableOpacity style={styles.actionDeleteBtn} onPress={handleDeleteLastQuestion}>
                <Ionicons name="remove-circle-outline" size={18} color={COLORS.error} />
                <Text style={styles.actionDeleteText}>- ลบข้อสุดท้าย</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      )}

      {/* ===== 4. แถบปุ่มบันทึกด้านล่างสุด (Bottom Save Bar) ===== */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.saveFullBtn} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Ionicons name="checkmark-done" size={22} color="white" />
              <Text style={styles.saveFullBtnText}>บันทึกเฉลย ({filledCount} ข้อ)</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

/**
 * strKey: ฟังก์ชันแปลงตัวเลขเป็น String สำหรับใช้เป็น Key ของ Object
 */
function strKey(n) {
  return String(n);
}

// ===== สไตล์การตกแต่งหน้าจอ (StyleSheet) =====
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },

  // แถบ Header หลักด้านบน
  topHeader: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
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

  // ข้อความหัวข้อด้านบน
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textLight,
  },

  // ปุ่มบันทึกด่วนใน Header
  saveHeaderBtn: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },

  saveHeaderBtnText: {
    color: COLORS.primaryDark,
    fontWeight: 'bold',
    fontSize: 14,
  },

  // แถบแสดงข้อมูลรายวิชาด้านล่าง Header
  subHeader: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  subjectTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },

  subjectCode: {
    fontSize: 13,
    color: COLORS.slate,
    fontWeight: '600',
  },

  // ปุ่มถ่ายรูปเฉลยด้วยกล้อง
  cameraScanBtn: {
    backgroundColor: COLORS.brown,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    ...SHADOWS.small,
  },

  cameraScanBtnText: {
    color: 'white',
    fontSize: 13,
    fontWeight: 'bold',
  },

  // หน้าต่างแสดงตอนกำลังโหลดข้อมูล
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 100, // เว้นระยะด้านล่างเพื่อไม่ให้โดน Bottom Bar ทับ
  },

  // ป้ายแสดงสถานะการเฉลย
  infoBanner: {
    backgroundColor: COLORS.primaryLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },

  infoText: {
    fontSize: 13,
    color: COLORS.primaryDark,
    flex: 1,
    lineHeight: 18,
  },

  // แถวของแต่ละข้อสอบ
  questionRow: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // กลุ่มเลขข้อและปุ่มจัดการ
  qNumContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 85,
  },

  qNumText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },

  // ปุ่มล้างตัวเลือก
  clearChoiceBtn: {
    padding: 2,
  },

  // ปุ่มลบข้อสอบ
  deleteRowBtn: {
    padding: 2,
    marginLeft: 2,
  },

  // กลุ่มปุ่มตัวเลือก 1-5
  choiceGroup: {
    flexDirection: 'row',
    gap: 8,
  },

  // ปุ่มตัวเลือกวงกลมปกติ (ยังไม่เลือก)
  choiceBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
  },

  // ปุ่มตัวเลือกเมื่อถูกเลือกเป็นเฉลย (สีเด่น)
  choiceBtnSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryDark,
  },

  choiceText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },

  choiceTextSelected: {
    color: 'white',
  },

  // แถวปุ่มเพิ่ม/ลดข้อสอบ
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    flexWrap: 'wrap',
  },

  // ปุ่มเพิ่มข้อ
  actionAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },

  actionAddText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.primaryDark,
  },

  // ปุ่มลบข้อ
  actionDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COLORS.errorBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.error,
  },

  actionDeleteText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.error,
  },

  // แถบปุ่มบันทึกที่ลอยติดอยู่ด้านล่างหน้าจอ
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    ...SHADOWS.medium,
  },

  // ปุ่มบันทึกขนาดใหญ่เต็มความกว้าง
  saveFullBtn: {
    backgroundColor: COLORS.primary,
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    ...SHADOWS.small,
  },

  saveFullBtnText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});