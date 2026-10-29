import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Image,
  StatusBar, Platform, FlatList, TextInput, Alert, ActivityIndicator, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { db, auth } from '../firebaseConfig';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { COLORS, SHADOWS } from '../theme';
import { getLocalStudentId, setLocalStudentId } from '../userProfileStorage';

export default function ScoreScreen({ route, navigation }) {
  const { subject } = route.params || {};
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState(null);

  const [editingScoreItem, setEditingScoreItem] = useState(null);
  const [editStudentId, setEditStudentId] = useState('');
  const [editStudentName, setEditStudentName] = useState('');

  // Student DB Selection State
  const [dbStudents, setDbStudents] = useState([]);
  const [isDbLoading, setIsDbLoading] = useState(false);
  const [showDbPickerInEdit, setShowDbPickerInEdit] = useState(false);
  const [dbSearchQuery, setDbSearchQuery] = useState('');

  const currentUser = auth.currentUser;
  const [currentUserStudentId, setCurrentUserStudentId] = useState('');
  const [currentUserDisplayName, setCurrentUserDisplayName] = useState(currentUser?.displayName || '');
  const isOwner = !subject?.owner || subject?.owner === currentUser?.uid;

  useEffect(() => {
    if (currentUser?.uid) {
      const localId = getLocalStudentId(currentUser.uid);
      if (localId) setCurrentUserStudentId(localId);

      getDoc(doc(db, 'users', currentUser.uid))
        .then(snap => {
          if (snap.exists()) {
            const data = snap.data();
            if (data.studentId) {
              setCurrentUserStudentId(data.studentId);
              setLocalStudentId(currentUser.uid, data.studentId);
            }
            if (data.displayName || data.name) {
              setCurrentUserDisplayName(data.displayName || data.name);
            }
          }
        })
        .catch(e => console.warn("Could not fetch user profile for score highlight:", e));
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    let unsubs = [];
    setLoading(true);

    let subcollectionScores = [];
    let rootScores = [];

    const combineAndSetScores = () => {
      const map = new Map();
      [...subcollectionScores, ...rootScores].forEach(item => {
        map.set(item.id, item);
      });
      const combined = Array.from(map.values());
      combined.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setScores(combined);
      setLoading(false);
    };

    if (subject?.id) {
      // 1. ดึงจาก Subcollection: subjects/{subject.id}/scores
      try {
        const unsubSub = onSnapshot(
          collection(db, "subjects", subject.id, "scores"),
          (snapshot) => {
            const list = [];
            snapshot.forEach((docSnap) => {
              list.push({
                id: docSnap.id,
                _isSubcollection: true,
                ...docSnap.data(),
              });
            });
            subcollectionScores = list;
            combineAndSetScores();
          },
          (error) => {
            console.warn("Subcollection scores error:", error.message);
            setLoading(false);
          }
        );
        unsubs.push(unsubSub);
      } catch (e) {
        console.warn("Error subscribing to subcollection scores:", e);
      }

      // 2. ดึงจาก Root collection: scores (ถ้ามีสิทธิ์)
      try {
        const qRoot = query(collection(db, "scores"), where("subjectId", "==", subject.id));
        const unsubRoot = onSnapshot(
          qRoot,
          (snapshot) => {
            const list = [];
            snapshot.forEach((docSnap) => {
              list.push({
                id: docSnap.id,
                _isSubcollection: false,
                ...docSnap.data(),
              });
            });
            rootScores = list;
            combineAndSetScores();
          },
          (error) => {
            // หาก Root collection ติดสิทธิ์ permissions ไม่ต้องพัง ให้ใช้ Subcollection แทน
            console.warn("Root collection scores permission warning:", error.message);
            setLoading(false);
          }
        );
        unsubs.push(unsubRoot);
      } catch (e) {
        console.warn("Error subscribing to root scores:", e);
      }
    } else {
      // สำหรับกรณีไม่ได้เจาะจงรายวิชา ดึงจาก root collection `scores`
      try {
        const q = query(collection(db, "scores"));
        const unsub = onSnapshot(
          q,
          (snapshot) => {
            const list = [];
            snapshot.forEach((docSnap) => {
              list.push({
                id: docSnap.id,
                _isSubcollection: false,
                ...docSnap.data(),
              });
            });
            list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setScores(list);
            setLoading(false);
          },
          (error) => {
            console.error("General scores error:", error.message);
            setLoading(false);
          }
        );
        unsubs.push(unsub);
      } catch (e) {
        setLoading(false);
      }
    }

    return () => {
      unsubs.forEach(unsub => unsub && unsub());
    };
  }, [subject?.id]);

  const handleDeleteScore = (scoreItem) => {
    Alert.alert(
      "ยืนยันการลบ",
      `ต้องการลบผลคะแนนรหัส ${scoreItem.studentId || '-'} หรือไม่?`,
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ลบ",
          style: "destructive",
          onPress: async () => {
            try {
              if (scoreItem._isSubcollection && subject?.id) {
                await deleteDoc(doc(db, "subjects", subject.id, "scores", scoreItem.id));
              } else {
                try {
                  await deleteDoc(doc(db, "scores", scoreItem.id));
                } catch (e) {
                  if (subject?.id) {
                    await deleteDoc(doc(db, "subjects", subject.id, "scores", scoreItem.id));
                  } else {
                    throw e;
                  }
                }
              }
              Alert.alert("สำเร็จ", "ลบผลคะแนนเรียบร้อยแล้ว");
            } catch (e) {
              Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถลบผลคะแนนได้: " + e.message);
            }
          }
        }
      ]
    );
  };

  /**
   * toggleExpand: สลับการกาง/หุบรายละเอียดเฉลยแจกแจงทุกข้อของนักเรียนคนนั้น
   * @param {string} id - รหัส Document คะแนนที่ต้องการกางดู
   */
  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  /**
   * fetchStudentsForEdit: ดึงรายชื่อนิสิตทั้งหมดจาก Firestore (collection: users)
   * มาแสดงในช่องค้นหา/ดรอปดาวน์สำหรับเลือกแก้ไขรหัสนิสิตและชื่อ เพื่อไม่ต้องพิมพ์เอง
   */
  const fetchStudentsForEdit = async () => {
    // ถ้าเคยโหลดรายชื่อไว้แล้ว ให้สลับเปิด/ปิด Picker ทันที
    if (dbStudents.length > 0) {
      setShowDbPickerInEdit(prev => !prev);
      return;
    }
    setIsDbLoading(true);
    setShowDbPickerInEdit(true);
    try {
      // ดึงข้อมูลผู้ใช้งานทั้งหมดจาก collection 'users'
      const querySnap = await getDocs(collection(db, 'users'));
      const list = [];
      querySnap.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          studentId: data.studentId || '',
          displayName: data.displayName || data.name || '',
          email: data.email || '',
        });
      });
      // เรียงลำดับ: ผู้ที่มีรหัสนิสิตขึ้นก่อน และเรียงตามตัวอักษร ก-ฮ / A-Z
      list.sort((a, b) => {
        if (a.studentId && !b.studentId) return -1;
        if (!a.studentId && b.studentId) return 1;
        return (a.studentId || a.displayName).localeCompare(b.studentId || b.displayName);
      });
      setDbStudents(list);
    } catch (e) {
      console.warn("Could not fetch students from DB:", e.message);
      Alert.alert("แจ้งเตือน", "ไม่สามารถดึงข้อมูลรายชื่อนิสิตได้: " + e.message);
    } finally {
      setIsDbLoading(false);
    }
  };

  /**
   * handleSelectDbStudent: เมื่อครูคลิกเลือกนิสิตจากรายการฐานข้อมูล
   * นำรหัสนิสิตและชื่อมากรอกลงในช่องฟอร์มแก้ไขอัตโนมัติ
   */
  const handleSelectDbStudent = (student) => {
    setEditStudentId(student.studentId || '');
    setEditStudentName(student.displayName || '');
    setShowDbPickerInEdit(false);
  };

  /**
   * handleOpenScoreEdit: เปิด Modal สำหรับแก้ไขรหัสนิสิตและชื่อของผลคะแนนรายการนั้น
   * @param {object} item - ข้อมูลผลคะแนนที่ต้องการแก้ไข
   */
  const handleOpenScoreEdit = (item) => {
    setEditingScoreItem(item);
    setEditStudentId(item.studentId && item.studentId !== '-' ? item.studentId : '');
    setEditStudentName(item.studentName || '');
    setShowDbPickerInEdit(false);
    setDbSearchQuery('');
  };

  /**
   * handleSaveScoreEdit: บันทึกข้อมูลรหัสนิสิตและชื่อที่แก้ไขแล้วลง Firestore
   * อัปเดตทั้งใน Subcollection (subjects/{id}/scores) และ Root collection (scores)
   * พร้อมอัปเดต Local State ให้ UI เปลี่ยนแปลงทันที
   */
  const handleSaveScoreEdit = async () => {
    if (!editingScoreItem) return;
    const trimmedId = editStudentId.trim();
    if (!trimmedId || trimmedId === '-') {
      Alert.alert("แจ้งเตือน", "กรุณาระบุรหัสนิสิตก่อนบันทึก");
      return;
    }
    const trimmedName = editStudentName.trim();
    const targetSubjectId = subject?.id || editingScoreItem.subjectId;

    try {
      let updated = false;

      // 1. อัปเดตใน Subcollection: subjects/{subjectId}/scores/{scoreId}
      if (targetSubjectId) {
        try {
          await updateDoc(doc(db, 'subjects', targetSubjectId, 'scores', editingScoreItem.id), {
            studentId: trimmedId,
            studentName: trimmedName
          });
          updated = true;
        } catch (e) {
          console.warn("Subcollection update warning:", e.message);
        }
      }

      // 2. อัปเดตใน Root collection: scores/{scoreId}
      try {
        await updateDoc(doc(db, 'scores', editingScoreItem.id), {
          studentId: trimmedId,
          studentName: trimmedName
        });
        updated = true;
      } catch (e) {
        if (!updated) {
          throw e;
        }
      }

      // อัปเดต state scores ทันที เพื่อให้ UI รีเฟรชโดยไม่ต้องรอโหลดใหม่
      setScores(prev => prev.map(s => {
        if (s.id === editingScoreItem.id) {
          return { ...s, studentId: trimmedId, studentName: trimmedName };
        }
        return s;
      }));

      setEditingScoreItem(null);
      setShowDbPickerInEdit(false);
      Alert.alert("สำเร็จ", "แก้ไขรหัสนิสิตและชื่อเรียบร้อยแล้ว");
    } catch (e) {
      console.error("Edit score error:", e);
      Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถแก้ไขข้อมูลได้: " + e.message);
    }
  };

  // กรองข้อมูลตาม Search Query
  const filteredScores = scores.filter(item => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const sId = (item.studentId || '').toLowerCase();
    const sName = (item.studentName || '').toLowerCase();
    return sId.includes(q) || sName.includes(q);
  });

  // จัดอันดับเรียงให้คะแนนของตัวเองอยู่บนสุดก่อนคนอื่น
  const sortedFilteredScores = [...filteredScores].sort((a, b) => {
    const isMyA = Boolean(
      currentUser && (
        (currentUserStudentId && a.studentId && a.studentId !== '-' &&
         a.studentId.trim().toLowerCase() === currentUserStudentId.trim().toLowerCase()) ||
        (currentUserDisplayName && a.studentName &&
         a.studentName.trim().toLowerCase() === currentUserDisplayName.trim().toLowerCase()) ||
        (a.studentUid && a.studentUid === currentUser.uid) ||
        (a.userId && a.userId === currentUser.uid)
      )
    );
    const isMyB = Boolean(
      currentUser && (
        (currentUserStudentId && b.studentId && b.studentId !== '-' &&
         b.studentId.trim().toLowerCase() === currentUserStudentId.trim().toLowerCase()) ||
        (currentUserDisplayName && b.studentName &&
         b.studentName.trim().toLowerCase() === currentUserDisplayName.trim().toLowerCase()) ||
        (b.studentUid && b.studentUid === currentUser.uid) ||
        (b.userId && b.userId === currentUser.uid)
      )
    );
    if (isMyA && !isMyB) return -1;
    if (!isMyA && isMyB) return 1;
    return 0;
  });

  // คำนวณสถิติ
  const totalCount = scores.length;
  const avgScore = totalCount > 0
    ? (scores.reduce((sum, item) => sum + (item.score || 0), 0) / totalCount).toFixed(1)
    : '0.0';
  const maxScoreFound = totalCount > 0
    ? Math.max(...scores.map(s => s.score || 0))
    : 0;
  const minScoreFound = totalCount > 0
    ? Math.min(...scores.map(s => s.score || 0))
    : 0;
  const passCount = scores.filter(s => {
    const max = s.maxScore || 1;
    return (s.score / max) >= 0.5;
  }).length;
  const passPercent = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0;

  const formatDate = (timestamp) => {
    if (!timestamp || !timestamp.seconds) return 'ไม่ระบุเวลา';
    const date = new Date(timestamp.seconds * 1000);
    return date.toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  const handleViewImage = (scoreItem) => {
    const url = scoreItem.imageUrl || scoreItem.imageUri;
    if (url) {
      setSelectedImageUrl(url);
    } else {
      Alert.alert(
        "ไม่พบรูปภาพกระดาษคำตอบ",
        "รายการนี้ไม่มีไฟล์รูปภาพกระดาษคำตอบบันทึกไว้ (อาจเป็นรายการที่สแกนตรวจก่อนระบบบันทึกรูปภาพ)"
      );
    }
  };

  const exportToExcel = async () => {
    const listToExport = filteredScores.length > 0 ? filteredScores : scores;
    if (!listToExport || listToExport.length === 0) {
      Alert.alert("เตือน", "ไม่มีข้อมูลผลคะแนนสำหรับส่งออกเป็นไฟล์ Excel");
      return;
    }

    try {
      // คำนวณหาจำนวนข้อสอบสูงสุดของรายการทั้งหมดที่เลือกส่งออก
      let maxQNum = 0;
      listToExport.forEach(item => {
        const answers = item.answers || [];
        answers.forEach(a => {
          if (typeof a.question === 'number' && a.question > maxQNum) maxQNum = a.question;
        });
        if (item.totalQuestions > maxQNum) maxQNum = item.totalQuestions;
        if (item.maxScore > maxQNum) maxQNum = item.maxScore;
      });

      if (maxQNum <= 0) maxQNum = 20;

      // 1. สร้างหัวตาราง (CSV Header) แบบ Grid Matrix: ลำดับที่ | รหัสนักเรียน | ชื่อ-นามสกุล | คะแนนที่ได้ | คะแนนเต็ม | ข้อ 1 | ข้อ 2 | ... | ข้อ N
      const baseHeaders = ['ลำดับที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุลนักเรียน', 'คะแนนที่ได้', 'คะแนนเต็ม'];
      const questionHeaders = Array.from({ length: maxQNum }, (_, i) => `ข้อ ${i + 1}`);
      const headers = [...baseHeaders, ...questionHeaders];

      const escapeCsv = (val) => {
        if (val === undefined || val === null) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      // 2. แปลงข้อมูลแต่ละนักเรียนเป็น CSV Row
      const rows = listToExport.map((item, index) => {
        const seq = index + 1;
        const studentId = item.studentId || '-';
        const studentName = item.studentName || '-';
        const score = item.score ?? 0;
        const maxScore = item.maxScore || item.totalQuestions || maxQNum;

        const answersList = item.answers || [];
        const answersMap = new Map();
        answersList.forEach(a => {
          if (a.question) answersMap.set(Number(a.question), a);
        });

        // สร้างข้อมูลของแต่ละข้อสอบ (ข้อ 1 ถึง ข้อ N)
        const questionCols = Array.from({ length: maxQNum }, (_, i) => {
          const qNum = i + 1;
          const ans = answersMap.get(qNum);
          if (!ans) return escapeCsv('-');

          const sel = ans.selected || '-';
          if (ans.status === 'correct') {
            return escapeCsv(`${sel} (ถูก)`);
          } else {
            const exp = (ans.expected && ans.expected !== '-') ? `/เฉลย ${ans.expected}` : '';
            return escapeCsv(`${sel} (ผิด${exp})`);
          }
        });

        const baseCols = [
          seq,
          escapeCsv(studentId),
          escapeCsv(studentName),
          score,
          maxScore
        ];

        return [...baseCols, ...questionCols].join(',');
      });

      // นำหน้าด้วย UTF-8 BOM '\uFEFF' เพื่อให้ Microsoft Excel / Google Sheets อ่านภาษาไทยได้อย่างถูกต้อง
      const csvContent = '\uFEFF' + [headers.map(h => escapeCsv(h)).join(','), ...rows].join('\n');
      const subjectCodeName = subject?.subjectCode || subject?.subjectName || 'Scores';
      const cleanSubjectName = subjectCodeName.replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
      const filename = `ผลคะแนน_${cleanSubjectName}_${Date.now()}.csv`;

      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        const fileUri = `${baseDir}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, csvContent, {
          encoding: FileSystem.EncodingType.UTF8
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: 'ส่งออกผลคะแนนเป็น Excel (CSV)',
            UTI: 'public.comma-separated-values-text'
          });
        } else {
          Alert.alert("บันทึกไฟล์สำเร็จ", `ส่งออกผลคะแนนเรียบร้อยแล้วที่:\n${fileUri}`);
        }
      }
    } catch (error) {
      console.error("Export CSV Error:", error);
      Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถส่งออกไฟล์ Excel ได้: " + error.message);
    }
  };

  const renderScoreCard = ({ item }) => {
    const isExpanded = expandedId === item.id;
    const maxSc = item.maxScore || item.totalQuestions || 1;
    const percent = Math.round(((item.score || 0) / maxSc) * 100);
    const isPass = percent >= 50;

    // เด่นเฉพาะรหัสนิสิตหรือข้อสอบของตนเอง
    const isMyScore = Boolean(
      currentUser && (
        (currentUserStudentId &&
         item.studentId && item.studentId !== '-' &&
         item.studentId.trim().toLowerCase() === currentUserStudentId.trim().toLowerCase()) ||
        (currentUserDisplayName &&
         item.studentName &&
         item.studentName.trim().toLowerCase() === currentUserDisplayName.trim().toLowerCase()) ||
        (item.studentUid && item.studentUid === currentUser.uid) ||
        (item.userId && item.userId === currentUser.uid)
      )
    );

    return (
      <View style={[styles.scoreCard, isMyScore && styles.myScoreCard]}>
        {/* Top summary row */}
        <TouchableOpacity
          style={styles.cardMain}
          activeOpacity={0.8}
          onPress={() => toggleExpand(item.id)}
        >
          <View style={styles.studentInfoBox}>
            <View style={[
              styles.avatarCircle,
              isMyScore ? styles.myAvatarCircle : { backgroundColor: isPass ? COLORS.primaryLight : COLORS.errorBackground }
            ]}>
              <Ionicons
                name={isMyScore ? "person" : (isPass ? "checkmark-circle" : "alert-circle")}
                size={22}
                color={isMyScore ? '#B45309' : (isPass ? COLORS.primary : COLORS.error)}
              />
            </View>
            <View style={{ flex: 1 }}>
              {(!item.studentId || item.studentId === '-') ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={[styles.studentIdText, { color: COLORS.slate }]}>
                    รหัส: ยังไม่ระบุ
                  </Text>
                  {isOwner && (
                    <TouchableOpacity
                      onPress={() => handleOpenScoreEdit(item)}
                      style={{ backgroundColor: COLORS.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: COLORS.primary }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: 'bold', color: COLORS.primaryDark }}>✏️ ระบุรหัส</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <Text style={[styles.studentIdText, isMyScore && styles.myStudentIdText]}>
                  รหัส: {item.studentId}
                </Text>
              )}
              {item.studentName ? (
                <Text style={[styles.studentNameText, isMyScore && { fontWeight: 'bold', color: '#92400E' }]}>
                  {item.studentName}
                </Text>
              ) : null}
              <Text style={styles.dateText}>
                <Ionicons name="time-outline" size={12} color={COLORS.slate} /> {formatDate(item.createdAt)}
              </Text>
            </View>
          </View>

          <View style={[styles.scoreBadgeBox, isMyScore && styles.myScoreBadgeBox]}>
            <Text style={[styles.scoreBigText, isMyScore ? styles.myScoreBigText : { color: isPass ? COLORS.primary : COLORS.error }]}>
              {item.score ?? 0} <Text style={[styles.maxScoreText, isMyScore && { color: '#B45309' }]}>/ {maxSc}</Text>
            </Text>
            <View style={[
              styles.percentBadge, 
              isMyScore 
                ? { backgroundColor: '#F59E0B' } 
                : { backgroundColor: isPass ? COLORS.secondaryLight : COLORS.errorBackground }
            ]}>
              <Text style={[
                styles.percentText, 
                isMyScore 
                  ? { color: '#FFFFFF', fontWeight: 'bold' } 
                  : { color: isPass ? COLORS.primaryDark : COLORS.error }
              ]}>
                {percent}%
              </Text>
            </View>
          </View>

          {isOwner && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleOpenScoreEdit(item)}
              >
                <Ionicons name="create-outline" size={20} color={isMyScore ? '#B45309' : COLORS.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDeleteScore(item)}
              >
                <Ionicons name="trash-outline" size={20} color={COLORS.error} />
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>

        {/* Action bar for View Image & View Details */}
        <View style={[styles.cardActionBar, isMyScore && styles.myCardActionBar]}>
          <TouchableOpacity
            style={styles.imageActionBtn}
            onPress={() => handleViewImage(item)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={(item.imageUrl || item.imageUri) ? "image" : "image-outline"}
              size={16}
              color={(item.imageUrl || item.imageUri) ? (isMyScore ? '#B45309' : COLORS.primary) : COLORS.slate}
            />
            <Text style={[
              styles.imageActionText, 
              isMyScore && { color: '#92400E', fontWeight: '600' },
              !(item.imageUrl || item.imageUri) && { color: COLORS.slate }
            ]}>
              {(item.imageUrl || item.imageUri) ? "ดูรูปกระดาษคำตอบที่ตรวจแล้ว" : "ไม่มีรูปกระดาษคำตอบ"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.expandActionBtn}
            onPress={() => toggleExpand(item.id)}
            activeOpacity={0.8}
          >
            <Text style={[styles.expandActionText, isMyScore && { color: '#92400E', fontWeight: 'bold' }]}>
              {isExpanded ? 'ซ่อนคำตอบ' : 'ดูคำตอบรายข้อ'}
            </Text>
            <Ionicons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={isMyScore ? '#B45309' : COLORS.primary}
            />
          </TouchableOpacity>
        </View>

        {/* Answer Breakdown Details */}
        {isExpanded && (
          <View style={[styles.detailsBox, isMyScore && styles.myDetailsBox]}>
            <Text style={[styles.detailsTitle, isMyScore && { color: '#92400E' }]}>รายละเอียดคำตอบที่ตรวจสแกน:</Text>
            {item.answers && item.answers.length > 0 ? (
              <View style={styles.answersGrid}>
                {item.answers.map((ans, idx) => {
                  const correct = ans.status === 'correct';
                  return (
                    <View key={idx} style={[styles.gridChip, correct ? styles.chipCorrect : styles.chipIncorrect]}>
                      <Text style={styles.chipQNum}>ข้อ {ans.question || (idx + 1)}</Text>
                      <Text style={styles.chipAnswerText}>
                        ตอบ: <Text style={{ fontWeight: 'bold' }}>{ans.selected || '-'}</Text>
                      </Text>
                      {ans.expected && ans.expected !== '-' ? (
                        <Text style={styles.chipExpectedText}>(เฉลย {ans.expected})</Text>
                      ) : null}
                      <Ionicons
                        name={correct ? "checkmark" : "close"}
                        size={12}
                        color={correct ? COLORS.primaryDark : COLORS.error}
                      />
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.noDetailText}>ไม่มีรายละเอียดคำตอบบันทึกไว้</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.textLight} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center', flex: 1, marginHorizontal: 8 }}>
          <Text style={styles.headerTitle}>รายงานผลคะแนน</Text>
          {subject?.subjectName ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>{subject.subjectCode} - {subject.subjectName}</Text>
          ) : null}
        </View>

        {totalCount > 0 ? (
          <TouchableOpacity
            style={styles.excelHeaderBtn}
            onPress={exportToExcel}
            activeOpacity={0.8}
          >
            <Ionicons name="document-text-outline" size={16} color="white" />
            <Text style={styles.excelHeaderBtnText}>Excel</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* KPI Stats Overview */}
      {totalCount > 0 ? (
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Ionicons name="people-outline" size={20} color={COLORS.primary} />
            <Text style={styles.statValue}>{totalCount}</Text>
            <Text style={styles.statLabel}>จำนวนผู้สอบ</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="stats-chart-outline" size={20} color={COLORS.brown} />
            <Text style={styles.statValue}>{avgScore}</Text>
            <Text style={styles.statLabel}>คะแนนเฉลี่ย</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="trophy-outline" size={20} color={COLORS.success} />
            <Text style={styles.statValue}>{maxScoreFound}/{minScoreFound}</Text>
            <Text style={styles.statLabel}>สูงสุด / ต่ำสุด</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="checkmark-done-circle-outline" size={20} color={COLORS.primaryDark} />
            <Text style={styles.statValue}>{passPercent}%</Text>
            <Text style={styles.statLabel}>สอบผ่าน</Text>
          </View>
        </View>
      ) : null}

      {/* Search Input */}
      {totalCount > 0 ? (
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={COLORS.slate} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="ค้นหาด้วยรหัสนักเรียน..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={COLORS.slate} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* Content Body */}
      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ marginTop: 12, color: COLORS.slate }}>กำลังโหลดข้อมูลผลคะแนน...</Text>
        </View>
      ) : filteredScores.length > 0 ? (
        <FlatList
          data={sortedFilteredScores}
          keyExtractor={(item) => item.id}
          renderItem={renderScoreCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyCenter}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="clipboard-outline" size={60} color={COLORS.primary} />
          </View>
          <Text style={styles.emptyTitle}>
            {searchQuery ? 'ไม่พบข้อมูลที่ค้นหา' : 'ยังไม่มีการบันทึกผลคะแนน'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery
              ? 'ลองค้นหาด้วยรหัสนักเรียนใหม่อีกครั้ง'
              : 'ยังไม่มีผลคะแนนบันทึกอยู่ในระบบ'}
          </Text>
        </View>
      )}

      {/* Edit Score Student Info Modal */}
      <Modal visible={Boolean(editingScoreItem)} transparent animationType="fade">
        <View style={styles.configModalContainer}>
          <View style={[styles.configModalContent, { maxHeight: '90%' }]}>
            <View style={styles.configModalHeader}>
              <Ionicons name="create-outline" size={24} color={COLORS.primary} />
              <Text style={styles.configModalTitle}>แก้ไข / ระบุรหัสนิสิต</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Answer sheet image preview */}
              {(editingScoreItem?.imageUrl || editingScoreItem?.imageUri) ? (
                <View style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: COLORS.slate }}>
                      📷 รูปกระดาษคำตอบ (กดดูภาพเต็ม):
                    </Text>
                    <TouchableOpacity
                      onPress={() => setSelectedImageUrl(editingScoreItem.imageUrl || editingScoreItem.imageUri)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <Ionicons name="expand-outline" size={14} color={COLORS.primary} />
                      <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: 'bold' }}>ดูรูปขยาย</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setSelectedImageUrl(editingScoreItem.imageUrl || editingScoreItem.imageUri)}
                  >
                    <Image
                      source={{ uri: editingScoreItem.imageUrl || editingScoreItem.imageUri }}
                      style={{
                        width: '100%',
                        height: 170,
                        borderRadius: 10,
                        backgroundColor: '#f1f5f9',
                        borderWidth: 1,
                        borderColor: COLORS.border
                      }}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                </View>
              ) : null}

              <Text style={styles.inputLabelText}>รหัสนิสิต (Student ID):</Text>
              <TextInput
                style={styles.studentInput}
                value={editStudentId}
                onChangeText={setEditStudentId}
                placeholder="กรอกรหัสนิสิต (เช่น 65xxxxxxxx)"
                placeholderTextColor={COLORS.slate}
                keyboardType="numeric"
              />

              <Text style={styles.inputLabelText}>ชื่อ-นามสกุล (Student Name):</Text>
              <TextInput
                style={styles.studentInput}
                value={editStudentName}
                onChangeText={setEditStudentName}
                placeholder="กรอกชื่อ-นามสกุล (ไม่บังคับ)"
                placeholderTextColor={COLORS.slate}
              />

              {/* Button to toggle database search */}
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  backgroundColor: COLORS.primaryLight,
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: COLORS.primary,
                  marginTop: 12,
                }}
                onPress={fetchStudentsForEdit}
              >
                <Ionicons name="people" size={16} color={COLORS.primaryDark} />
                <Text style={{ fontSize: 13, fontWeight: 'bold', color: COLORS.primaryDark }}>
                  {showDbPickerInEdit ? 'ซ่อนรายชื่อนิสิตในระบบ' : '🔍 ดึงรายชื่อนิสิตจากฐานข้อมูล'}
                </Text>
              </TouchableOpacity>

              {/* Inline DB Picker */}
              {showDbPickerInEdit && (
                <View style={{
                  marginTop: 10,
                  padding: 10,
                  backgroundColor: COLORS.surfaceVariant,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: COLORS.border
                }}>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      fontSize: 13,
                      backgroundColor: COLORS.surface,
                      marginBottom: 8,
                      color: COLORS.textPrimary
                    }}
                    value={dbSearchQuery}
                    onChangeText={setDbSearchQuery}
                    placeholder="พิมพ์รหัส หรือ ชื่อ เพื่อค้นหา..."
                    placeholderTextColor={COLORS.slate}
                  />

                  {isDbLoading ? (
                    <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 10 }} />
                  ) : (
                    <View style={{ maxHeight: 180 }}>
                      <ScrollView nestedScrollEnabled={true}>
                        {dbStudents
                          .filter(st => {
                            const q = dbSearchQuery.toLowerCase().trim();
                            if (!q) return true;
                            return (
                              (st.studentId && st.studentId.toLowerCase().includes(q)) ||
                              (st.displayName && st.displayName.toLowerCase().includes(q)) ||
                              (st.email && st.email.toLowerCase().includes(q))
                            );
                          })
                          .map((st, idx) => (
                            <TouchableOpacity
                              key={st.id || idx}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingVertical: 8,
                                borderBottomWidth: 1,
                                borderBottomColor: COLORS.border,
                                gap: 8
                              }}
                              onPress={() => handleSelectDbStudent(st)}
                            >
                              <Ionicons name="person-circle-outline" size={24} color={COLORS.primary} />
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: COLORS.textPrimary }}>
                                  {st.studentId ? `รหัส: ${st.studentId}` : 'ไม่ระบุรหัส'}
                                </Text>
                                <Text style={{ fontSize: 11, color: COLORS.slate }}>
                                  {st.displayName || st.email || 'นิสิต'}
                                </Text>
                              </View>
                              <Text style={{ fontSize: 11, color: COLORS.primaryDark, fontWeight: '600' }}>เลือก</Text>
                            </TouchableOpacity>
                          ))}
                        {dbStudents.length === 0 && (
                          <Text style={{ textAlign: 'center', color: COLORS.slate, padding: 8, fontSize: 12 }}>
                            ไม่พบรายชื่อในระบบ
                          </Text>
                        )}
                      </ScrollView>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setEditingScoreItem(null);
                  setShowDbPickerInEdit(false);
                }}
              >
                <Text style={styles.cancelBtnText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={handleSaveScoreEdit}
              >
                <Text style={styles.addBtnText}>บันทึก</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Fullscreen Image Viewer Modal */}
      <Modal
        visible={Boolean(selectedImageUrl)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedImageUrl(null)}
      >
        <View style={styles.imageViewerOverlay}>
          <SafeAreaView style={styles.imageViewerHeader}>
            <Text style={styles.imageViewerTitle}>รูปกระดาษคำตอบที่ตรวจแล้ว</Text>
            <TouchableOpacity
              style={styles.closeViewerBtn}
              onPress={() => setSelectedImageUrl(null)}
            >
              <Ionicons name="close" size={28} color="white" />
            </TouchableOpacity>
          </SafeAreaView>

          <View style={styles.imageViewerContainer}>
            {selectedImageUrl ? (
              <Image
                source={{ uri: selectedImageUrl }}
                style={styles.imageViewerContent}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  topHeader: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOWS.small,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textLight,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  statValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginVertical: 2,
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.slate,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  scoreCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOWS.small,
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    justifyContent: 'space-between',
  },
  studentInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentIdText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  studentNameText: {
    fontSize: 13,
    color: COLORS.slate,
  },
  dateText: {
    fontSize: 11,
    color: COLORS.slate,
    marginTop: 2,
  },
  scoreBadgeBox: {
    alignItems: 'flex-end',
    marginRight: 10,
  },
  scoreBigText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  maxScoreText: {
    fontSize: 13,
    color: COLORS.slate,
    fontWeight: 'normal',
  },
  percentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 3,
  },
  percentText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  deleteBtn: {
    padding: 6,
  },
  expandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryLight,
    paddingVertical: 6,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  expandBarText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  detailsBox: {
    padding: 12,
    backgroundColor: '#FAFBFB',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  detailsTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  answersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gridChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  chipCorrect: {
    backgroundColor: COLORS.primaryLight,
    borderColor: '#B2DFDB',
  },
  chipIncorrect: {
    backgroundColor: COLORS.errorBackground,
    borderColor: '#FFCDD2',
  },
  chipQNum: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  chipAnswerText: {
    fontSize: 11,
    color: COLORS.textPrimary,
  },
  chipExpectedText: {
    fontSize: 10,
    color: COLORS.slate,
  },
  noDetailText: {
    fontSize: 12,
    color: COLORS.slate,
    fontStyle: 'italic',
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primaryLight,
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
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.slate,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  primaryScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    ...SHADOWS.medium,
  },
  primaryScanBtnText: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
  cardActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primaryLight,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  imageActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  imageActionText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  expandActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  expandActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  viewSheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#B2DFDB',
  },
  viewSheetBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'space-between',
  },
  imageViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 10,
    paddingBottom: 10,
  },
  imageViewerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  closeViewerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  imageViewerContent: {
    width: '100%',
    height: '100%',
  },
  excelHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  excelHeaderBtnText: {
    color: COLORS.primaryDark,
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Highlight styling for User's own score card (เด่นด้วยสีทอง Amber/Gold ชัดเจน)
  myScoreCard: {
    borderWidth: 2.5,
    borderColor: '#F59E0B', // Bright Amber Gold
    borderLeftWidth: 8,
    borderLeftColor: '#D97706', // Bold Amber accent stripe
    backgroundColor: '#FFFBEB', // Noticeable Warm Amber 50
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  myScoreBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF3C7', // Amber 100
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 1.5,
    borderBottomColor: '#FDE68A',
  },
  myScoreBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  myScoreBannerText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#92400E', // Amber 800
  },
  myScorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  myScorePillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  myAvatarCircle: {
    backgroundColor: '#FEF3C7',
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  myStudentIdText: {
    color: '#92400E',
    fontWeight: 'bold',
    fontSize: 16,
  },
  myInlineBadge: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  myInlineBadgeText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: 'bold',
  },
  myScoreBadgeBox: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
  },
  myScoreBigText: {
    color: '#92400E',
    fontWeight: 'bold',
  },
  myCardActionBar: {
    backgroundColor: '#FEF3C7',
    borderTopColor: '#FDE68A',
  },
  myDetailsBox: {
    backgroundColor: '#FFFDF0',
    borderTopColor: '#FDE68A',
  },

  // Edit Form Styles in ScoreScreen
  configModalContainer: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  configModalContent: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 20 },
  configModalHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  configModalTitle: { fontSize: 18, fontWeight: "bold", color: COLORS.primary },
  inputLabelText: { fontSize: 12, fontWeight: 'bold', color: COLORS.slate, marginBottom: 4, marginTop: 8 },
  studentInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, backgroundColor: COLORS.surfaceVariant, color: COLORS.textPrimary },
  modalFooter: { flexDirection: "row", marginTop: 20, gap: 12 },
  cancelBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.surfaceVariant },
  cancelBtnText: { color: COLORS.slate, fontSize: 16, fontWeight: "600" },
  addBtn: { flex: 1, height: 48, borderRadius: 12, backgroundColor: COLORS.primary, justifyContent: "center", alignItems: "center", ...SHADOWS.small },
  addBtnText: { color: "white", fontSize: 16, fontWeight: "bold" },
});