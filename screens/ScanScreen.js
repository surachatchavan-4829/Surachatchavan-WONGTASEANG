import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Image,
  Dimensions, ActivityIndicator, Alert, ScrollView, StatusBar,
  TextInput, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { db, auth, storage } from '../firebaseConfig';
import { ref, uploadBytes, uploadString, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, doc, updateDoc, getDoc, getDocs, query, serverTimestamp } from 'firebase/firestore';
import { COLORS, SHADOWS } from '../theme';
import { getServerUrl, setServerUrlConfig } from '../serverConfig';
import { getLocalStudentId } from '../userProfileStorage';

const { width, height } = Dimensions.get('window');
const CHOICES = ['1', '2', '3', '4', '5'];

const ScanScreen = ({ route, navigation }) => {
  const { subject, mode = 'student' } = route.params || {};
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Scanning Mode: 'answer_key' | 'student'
  const [scanMode, setScanMode] = useState(mode);
  const [frameOrientation, setFrameOrientation] = useState('portrait'); // 'portrait' | 'landscape'

  // Active Subject Answer Key state
  const [activeSubjectKey, setActiveSubjectKey] = useState(subject?.answerKey || null);

  // Student Result Modal state
  const [isModalVisible, setModalVisible] = useState(false);
  const [examData, setExamData] = useState(null);

  // Batch Scan State (ประมวลผลกระดาษคำตอบหลายรูป)
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, statusText: '' });
  const [batchResults, setBatchResults] = useState([]);
  const [isBatchModalVisible, setBatchModalVisible] = useState(false);

  // Answer Key Review Modal state (โหมดถ่ายเฉลย)
  const [isKeyModalVisible, setKeyModalVisible] = useState(false);
  const [extractedKeyData, setExtractedKeyData] = useState({});

  // FastAPI Server Configuration
  const [serverUrl, setServerUrl] = useState(getServerUrl());
  const [isServerModalVisible, setServerModalVisible] = useState(false);
  const [inputUrl, setInputUrl] = useState(getServerUrl());

  // Student DB Selection State (ดึงรหัสนิสิตจากฐานข้อมูล)
  const [isStudentPickerVisible, setStudentPickerVisible] = useState(false);
  const [dbStudents, setDbStudents] = useState([]);
  const [isDbLoading, setIsDbLoading] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');

  // Fullscreen Preview Image Modal state
  const [selectedPreviewImage, setSelectedPreviewImage] = useState(null);

  // Batch item editing state
  const [editingBatchItem, setEditingBatchItem] = useState(null);
  const [batchEditStudentId, setBatchEditStudentId] = useState('');
  const [batchEditStudentName, setBatchEditStudentName] = useState('');
  const [showBatchDbPicker, setShowBatchDbPicker] = useState(false);
  const [batchDbSearchQuery, setBatchDbSearchQuery] = useState('');

  const fetchStudentsFromDb = async (openGeneralPicker = true) => {
    setIsDbLoading(true);
    if (openGeneralPicker) {
      setStudentPickerVisible(true);
    }
    try {
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
      list.sort((a, b) => {
        if (a.studentId && !b.studentId) return -1;
        if (!a.studentId && b.studentId) return 1;
        return (a.studentId || a.displayName).localeCompare(b.studentId || b.displayName);
      });
      setDbStudents(list);
    } catch (e) {
      console.warn("Could not fetch students from DB:", e.message);
      Alert.alert("แจ้งเตือน", "ไม่สามารถดึงข้อมูลรายชื่อนิสิตจากฐานข้อมูลได้: " + e.message);
    } finally {
      setIsDbLoading(false);
    }
  };

  const handleSelectStudent = (student) => {
    if (editingBatchItem) {
      setBatchEditStudentId(student.studentId || '');
      setBatchEditStudentName(student.displayName || '');
    } else {
      setExamData(prev => prev ? {
        ...prev,
        studentId: student.studentId || prev.studentId || '',
        studentName: student.displayName || prev.studentName || ''
      } : null);
    }
    setStudentPickerVisible(false);
  };

  const handleSelectBatchStudent = (student) => {
    setBatchEditStudentId(student.studentId || '');
    setBatchEditStudentName(student.displayName || '');
    setShowBatchDbPicker(false);
  };

  const handleOpenBatchEdit = (item) => {
    setEditingBatchItem(item);
    setBatchEditStudentId(item.studentId && item.studentId !== '-' ? item.studentId : '');
    setBatchEditStudentName(item.studentName || '');
    setShowBatchDbPicker(false);
    setBatchDbSearchQuery('');
  };

  const handleBatchEditPrev = () => {
    if (!editingBatchItem) return;
    const currentIndex = batchResults.findIndex(r => r.id === editingBatchItem.id);
    if (currentIndex > 0) {
      const prevItem = batchResults.slice(0, currentIndex).reverse().find(r => r.success);
      if (prevItem) {
        setEditingBatchItem(prevItem);
        setBatchEditStudentId(prevItem.studentId && prevItem.studentId !== '-' ? prevItem.studentId : '');
        setBatchEditStudentName(prevItem.studentName || '');
        setShowBatchDbPicker(false);
      }
    }
  };

  const handleSaveBatchEdit = async (advanceNext = false) => {
    if (!editingBatchItem) return;
    const trimmedId = batchEditStudentId.trim();
    if (!trimmedId || trimmedId === '-') {
      Alert.alert("แจ้งเตือน", "กรุณาระบุรหัสนิสิตก่อนบันทึก");
      return;
    }
    const trimmedName = batchEditStudentName.trim();
    const targetSubjectId = subject?.id || editingBatchItem.subjectId;

    try {
      if (editingBatchItem.docId) {
        let updated = false;
        if (targetSubjectId) {
          try {
            await updateDoc(doc(db, 'subjects', targetSubjectId, 'scores', editingBatchItem.docId), {
              studentId: trimmedId,
              studentName: trimmedName
            });
            updated = true;
          } catch (e) {
            console.warn("Subcollection update failed:", e.message);
          }
        }
        try {
          await updateDoc(doc(db, 'scores', editingBatchItem.docId), {
            studentId: trimmedId,
            studentName: trimmedName
          });
          updated = true;
        } catch (e) {
          if (!updated) throw e;
        }
      }

      const updatedResults = batchResults.map(res => {
        if (res.id === editingBatchItem.id) {
          return { ...res, studentId: trimmedId, studentName: trimmedName };
        }
        return res;
      });
      setBatchResults(updatedResults);

      if (advanceNext) {
        const currentIndex = batchResults.findIndex(r => r.id === editingBatchItem.id);
        const nextItem = updatedResults.slice(currentIndex + 1).find(r => r.success);
        if (nextItem) {
          setEditingBatchItem(nextItem);
          setBatchEditStudentId(nextItem.studentId && nextItem.studentId !== '-' ? nextItem.studentId : '');
          setBatchEditStudentName(nextItem.studentName || '');
          setShowBatchDbPicker(false);
          return;
        } else {
          setEditingBatchItem(null);
          setShowBatchDbPicker(false);
          Alert.alert("สำเร็จ", "ระบุรหัสนิสิตครบทุกใบเรียบร้อยแล้ว");
          return;
        }
      }

      setEditingBatchItem(null);
      setShowBatchDbPicker(false);
      Alert.alert("สำเร็จ", "อัปเดตรหัสนิสิตเรียบร้อยแล้ว");
    } catch (e) {
      console.error("Batch edit error:", e);
      Alert.alert("ข้อผิดพลาด", "ไม่สามารถอัปเดตรหัสนิสิตได้: " + e.message);
    }
  };

  const handleUseMyStudentId = async () => {
    const user = auth.currentUser;
    if (!user) {
      Alert.alert("แจ้งเตือน", "ไม่พบข้อมูลผู้ใช้ที่เข้าสู่ระบบในปัจจุบัน");
      return;
    }

    let myStudentId = getLocalStudentId(user.uid);
    let myName = user.displayName || '';

    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const data = snap.data();
        if (data.studentId) myStudentId = data.studentId;
        if (data.displayName) myName = data.displayName;
      }
    } catch (e) {
      console.warn("Error fetching user profile:", e);
    }

    if (!myStudentId) {
      Alert.alert("แจ้งเตือน", "บัญชีของคุณยังไม่ได้ตั้งค่ารหัสประจำตัว (สามารถระบุได้ในหน้าตั้งค่า)");
      return;
    }

    setExamData(prev => prev ? {
      ...prev,
      studentId: myStudentId,
      studentName: myName || prev.studentName || ''
    } : null);
  };

  // กรอบเล็งสแกนกระดาษ 150 ข้อ 5 คอลัมน์ (รองรับแนวนอน Landscape และแนวตั้ง Portrait)

  useEffect(() => {
    // โหลดเฉลยล่าสุดของรายวิชานี้จาก Firestore
    fetchLatestAnswerKey();
  }, [subject?.id]);

  const fetchLatestAnswerKey = async () => {
    if (!subject?.id) return;
    try {
      const snap = await getDoc(doc(db, 'subjects', subject.id));
      if (snap.exists() && snap.data().answerKey) {
        setActiveSubjectKey(snap.data().answerKey);
      }
    } catch (e) {
      console.warn("Could not fetch subject key:", e);
    }
  };

  const ensurePortraitImage = async (imageUri, imgWidth, imgHeight) => {
    // ส่งคืน URI ของรูปภาพโดยไม่บังคับหมุน 90 องศา (เพื่อให้ OpenCV บน Server ดัดรูปที่เอียงให้ตรงอย่างแม่นยำ)
    return imageUri;
  };

  const pickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("ต้องการสิทธิ์การใช้งาน", "กรุณายินยอมให้เข้าถึงคลังรูปภาพเพื่อเลือกรูปกระดาษคำตอบ");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1.0,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 0,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        if (result.assets.length === 1) {
          setIsLoading(true);
          const asset = result.assets[0];
          const portraitUri = await ensurePortraitImage(asset.uri, asset.width, asset.height);
          await analyzeImage({ uri: portraitUri });
        } else {
          // เลือกหลายรูปพร้อมกัน -> ส่งเข้าประมวลผลแบบ Batch
          await processBatchImages(result.assets);
        }
      }
    } catch (e) {
      setIsLoading(false);
      setIsBatchLoading(false);
      Alert.alert("Error", "ไม่สามารถเลือกรูปภาพได้: " + e.message);
    }
  };

  const takePhoto = async () => {
    if (cameraRef.current && isCameraReady) {
      try {
        setIsLoading(true);
        const photo = await cameraRef.current.takePictureAsync({
          quality: 1.0,
          skipProcessing: false,
        });

        if (photo) {
          const portraitUri = await ensurePortraitImage(photo.uri, photo.width, photo.height);
          await analyzeImage({ ...photo, uri: portraitUri });
        }
      } catch (e) {
        setIsLoading(false);
        Alert.alert("Error", "ไม่สามารถถ่ายภาพได้: " + e.message);
      }
    }
  };

  const createFormDataFile = async (photoInput, filename = 'omr.jpg') => {
    let uriString = '';
    if (typeof photoInput === 'string') {
      uriString = photoInput;
    } else if (photoInput && typeof photoInput === 'object') {
      uriString = photoInput.uri || photoInput.localUri || '';
    }

    if (Platform.OS === 'web') {
      try {
        const res = await fetch(uriString);
        const blob = await res.blob();
        return new File([blob], filename, { type: blob.type || 'image/jpeg' });
      } catch (e) {
        console.warn("Could not convert uri to blob on Web:", e);
        return { uri: uriString, name: filename, type: 'image/jpeg' };
      }
    } else {
      let cleanUri = uriString;
      if (Platform.OS === 'android') {
        if (!cleanUri.startsWith('file://') && !cleanUri.startsWith('content://') && !cleanUri.startsWith('http')) {
          cleanUri = `file://${cleanUri}`;
        }
      }

      return {
        uri: cleanUri,
        name: String(filename || 'omr.jpg'),
        type: 'image/jpeg',
      };
    }
  };

  const uploadFormData = async (url, formData) => {
    if (Platform.OS === 'web') {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        const detailStr = errJson?.detail ? (typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail)) : '';
        throw new Error(`Server ตอบกลับรหัสสถานะ ${response.status}${detailStr ? `: ${detailStr}` : ''}`);
      }
      return await response.json();
    } else {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.setRequestHeader('Accept', 'application/json');

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve(data);
            } catch (e) {
              resolve({ status: 'success', text: xhr.responseText });
            }
          } else {
            let detailStr = '';
            try {
              const errJson = JSON.parse(xhr.responseText);
              detailStr = errJson?.detail ? (typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail)) : '';
            } catch (e) {}
            reject(new Error(`Server ตอบกลับรหัสสถานะ ${xhr.status}${detailStr ? `: ${detailStr}` : ''}`));
          }
        };

        xhr.onerror = () => {
          reject(new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ (Network request failed)'));
        };

        xhr.ontimeout = () => {
          reject(new Error('การเชื่อมต่อเซิร์ฟเวอร์หมดเวลา (Timeout)'));
        };

        xhr.send(formData);
      });
    }
  };

  const analyzeImage = async (photo) => {
    const cleanServerUrl = serverUrl.replace(/\/+$/, '');

    // กรณีโหมดถ่ายรูปเฉลย (Answer Key)
    if (scanMode === 'answer_key') {
      try {
        const photoUri = typeof photo === 'string' ? photo : (photo?.uri || '');
        const fileToUpload = await createFormDataFile(photoUri, 'omr_key.jpg');
        const formData = new FormData();
        formData.append('file', fileToUpload);

        const data = await uploadFormData(`${cleanServerUrl}/extract_answer_key`, formData);
        setExtractedKeyData(processExtractedKeyData(data.answerKey || {}));
        setIsLoading(false);
        setKeyModalVisible(true);

      } catch (error) {
        console.error("Extract Answer Key Error:", error);
        setIsLoading(false);
        Alert.alert(
          "ไม่สามารถเชื่อมต่อ Server",
          `ไม่สามารถส่งภาพเฉลยไปยัง FastAPI Server (${serverUrl}) ได้\n\nคำแนะนำ:\n1. ตรวจสอบว่ารัน FastAPI Server (uvicorn) แล้ว\n2. หากใช้งานบนมือถือ ตรวจสอบว่าเชื่อมต่อ Wi-Fi เดียวกันและตั้งค่า IP ให้ตรงกับคอมพิวเตอร์\n\nรายละเอียด: ${error.message}`,
          [
            { text: "ตั้งค่า IP Server", onPress: () => { setInputUrl(serverUrl); setServerModalVisible(true); } },
            { text: "ตกลง", style: "cancel" }
          ]
        );
      }
      return;
    }

    // ===== ส่วนการตรวจกระดาษคำตอบนักเรียน (Student Sheet Prediction) =====
    // 1. แปลงรูปถ่ายเป็น FormData
    // 2. แนบ subject_id และ answer_key ไปยัง FastAPI Server (/predict)
    // 3. รับผลคะแนนและรายการคำตอบเพื่อนำมาแสดงใน Modal
    try {
      const photoUri = typeof photo === 'string' ? photo : (photo?.uri || '');
      const fileToUpload = await createFormDataFile(photoUri, 'omr_student.jpg');
      const formData = new FormData();
      formData.append('file', fileToUpload);

      if (subject?.id) {
        formData.append('subject_id', String(subject.id));
      }

      if (activeSubjectKey && Object.keys(activeSubjectKey).length > 0) {
        formData.append('answer_key', String(JSON.stringify(activeSubjectKey)));
      }

      const data = await uploadFormData(`${cleanServerUrl}/predict`, formData);

      let answers = data.answers || [];
      if ((!answers || answers.length === 0) && data.detections && data.detections.length > 0) {
        answers = data.detections.map((det, idx) => ({
          question: idx + 1,
          selected: det.class_name || `Class ${det.class_id}`,
          status: (det.confidence >= 0.5) ? 'correct' : 'incorrect',
          confidence: det.confidence
        }));
      }

      const totalQuestions = data.totalQuestions || answers.length || 0;
      const score = (data.score !== undefined) ? data.score : answers.filter(a => a.status === 'correct').length;

      let initialStudentId = (data.studentId && data.studentId !== '-') ? data.studentId : '';
      let initialStudentName = data.studentName || '';

      if (!initialStudentId && auth.currentUser) {
        const myLocalId = getLocalStudentId(auth.currentUser.uid);
        if (myLocalId) initialStudentId = myLocalId;
      }

      setExamData({
        imageUri: photo.uri,
        studentId: initialStudentId || '',
        studentName: initialStudentName,
        totalQuestions: totalQuestions,
        score: score,
        maxScore: data.maxScore || totalQuestions,
        summary: data.summary || `ตรวจพบ ${answers.length} รายการ`,
        answers: answers,
        detections: data.detections || []
      });

      setIsLoading(false);
      setModalVisible(true);

    } catch (error) {
      console.error("FastAPI OMR Error:", error);
      setIsLoading(false);
      Alert.alert(
        "ไม่สามารถเชื่อมต่อ Server",
        `ไม่สามารถส่งภาพไปยัง FastAPI Server (${serverUrl}) ได้\n\nคำแนะนำ:\n1. ตรวจสอบว่าเปิด Fast API server ในโฟลเดอร์ c:\\Project_OMR\\server แล้ว\n2. หากใช้งานผ่านอุปกรณ์จริง/มือถือ ให้ตั้งค่า IP ของคอมพิวเตอร์ผ่านปุ่มตั้งค่า (มุมขวาบน)\n\nรายละเอียด: ${error.message}`,
        [
          { text: "ตั้งค่า IP Server", onPress: () => { setInputUrl(serverUrl); setServerModalVisible(true); } },
          { text: "ตกลง", style: "cancel" }
        ]
      );
    }
  };

  // บันทึกเฉลยที่สกัดได้
  const handleSaveExtractedKey = async () => {
    if (!subject?.id) {
      Alert.alert(" Error", "ไม่พบ ID ของรายวิชา ไม่สามารถบันทึกเฉลยได้");
      return;
    }

    try {
      setIsLoading(true);
      // 1. บันทึกลง Firestore
      await updateDoc(doc(db, 'subjects', subject.id), {
        answerKey: extractedKeyData,
        updatedAt: serverTimestamp(),
      });

      // 2. ซิงค์กับ FastAPI Server
      const cleanServerUrl = serverUrl.replace(/\/+$/, '');
      try {
        await fetch(`${cleanServerUrl}/save_answer_key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject_id: subject.id,
            answer_key: extractedKeyData
          })
        });
      } catch (e) {
        console.warn("Could not sync server answer key:", e);
      }

      setActiveSubjectKey(extractedKeyData);
      setKeyModalVisible(false);

      Alert.alert(
        "บันทึกเฉลยสำเร็จ!",
        `ถอดเฉลยได้เรียบร้อย (${Object.keys(extractedKeyData).length} ข้อ)\nคุณสามารถเริ่มถ่ายรูปกระดาษคำตอบของนักเรียนได้ทันที`,
        [
          {
            text: "ถ่ายกระดาษนักเรียนต่อ",
            onPress: () => setScanMode('student')
          }
        ]
      );
    } catch (e) {
      Alert.alert("Error", "ไม่สามารถบันทึกเฉลยได้: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChoiceChangeInKey = (qNum, choice) => {
    setExtractedKeyData(prev => {
      const updated = { ...prev };
      if (updated[qNum] === choice) {
        delete updated[qNum];
      } else {
        updated[qNum] = choice;
      }
      return updated;
    });
  };

  const handleClearKeyQuestion = (qNum) => {
    setExtractedKeyData(prev => {
      const updated = { ...prev };
      delete updated[qNum];
      return updated;
    });
  };

  const handleAddKeyQuestion = (count = 1) => {
    setExtractedKeyData(prev => {
      const keys = Object.keys(prev).map(Number);
      const maxKey = keys.length > 0 ? Math.max(...keys) : 0;
      const updated = { ...prev };
      for (let i = 1; i <= count; i++) {
        updated[String(maxKey + i)] = '';
      }
      return updated;
    });
  };

  /**
   * handleReindexKeyQuestionsFromOne: ปรับเปลี่ยนเลขข้อทั้งหมดให้เรียงใหม่เริ่มตั้งแต่ข้อ 1, 2, 3...
   */
  const handleReindexKeyQuestionsFromOne = () => {
    setExtractedKeyData(prev => {
      const keys = Object.keys(prev).map(Number).sort((a, b) => a - b);
      if (keys.length === 0) return prev;
      const updated = {};
      keys.forEach((oldK, idx) => {
        updated[String(idx + 1)] = prev[String(oldK)] || '';
      });
      return updated;
    });
  };

  const processExtractedKeyData = (rawKey) => {
    const padded = { ...(rawKey || {}) };
    const len = Object.keys(padded).length;
    // หากตรวจพบข้อสอบ 1 - 24 ข้อ ให้ขยายเป็น 25 ข้อทันทีเพื่อให้ครบชุด
    if (len > 0 && len < 25) {
      for (let i = 1; i <= 25; i++) {
        const s = String(i);
        if (!padded[s]) padded[s] = '';
      }
    }
    return padded;
  };

  const handleEnsureTwentyFiveKeyQuestions = () => {
    setExtractedKeyData(prev => {
      const updated = { ...prev };
      for (let i = 1; i <= 25; i++) {
        const s = String(i);
        if (!updated[s]) updated[s] = '';
      }
      return updated;
    });
  };


  const handleDeleteKeyQuestionRow = (qNumStr) => {
    const qNumInt = Number(qNumStr);
    Alert.alert(
      "ลบข้อสอบ",
      `คุณต้องการลบ ข้อ ${qNumStr} ออกจากเฉลยหรือไม่?`,
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ลบข้อสอบ",
          style: "destructive",
          onPress: () => {
            setExtractedKeyData(prev => {
              const keys = Object.keys(prev).map(Number).sort((a, b) => a - b);
              const updated = {};
              for (const k of keys) {
                if (k < qNumInt) {
                  if (prev[String(k)]) updated[String(k)] = prev[String(k)];
                } else if (k > qNumInt) {
                  if (prev[String(k)]) updated[String(k - 1)] = prev[String(k)];
                }
              }
              return updated;
            });
          }
        }
      ]
    );
  };

  const uriToBlob = (uri) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        resolve(xhr.response);
      };
      xhr.onerror = function (e) {
        console.warn("XHR blob error:", e);
        reject(new TypeError("Network request failed"));
      };
      xhr.responseType = "blob";
      xhr.open("GET", uri, true);
      xhr.send(null);
    });
  };

  const saveSingleExamDataToFirestore = async (dataToSave) => {
    const cleanedAnswers = (dataToSave?.answers || []).map((ans, idx) => ({
      question: ans.question ?? (idx + 1),
      selected: ans.selected ?? '-',
      expected: ans.expected ?? '-',
      rawClass: ans.rawClass ?? '',
      status: ans.status ?? 'incorrect',
      confidence: ans.confidence ?? 0,
      box: ans.box ? {
        x1: ans.box.x1 ?? 0,
        y1: ans.box.y1 ?? 0,
        x2: ans.box.x2 ?? 0,
        y2: ans.box.y2 ?? 0,
      } : null,
    }));

    let finalImageUrl = dataToSave?.imageUri || '';
    let outerBase64 = null;
    if (dataToSave?.imageUri) {
      try {
        let uriToUpload = dataToSave.imageUri;
        if (Platform.OS !== 'web') {
          try {
            const manipResult = await ImageManipulator.manipulateAsync(
              dataToSave.imageUri,
              [{ resize: { width: 800 } }],
              { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
            );
            uriToUpload = manipResult.uri;
            outerBase64 = manipResult.base64;
          } catch (resizeErr) {
            console.warn("Resize image failed, using original:", resizeErr);
          }
        }

        const uploadTask = (async () => {
          const filename = `exam_scans/${auth.currentUser?.uid || 'guest'}_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
          const storageRef = ref(storage, filename);

          if (outerBase64) {
            await uploadString(storageRef, outerBase64, 'base64', { contentType: 'image/jpeg' });
          } else {
            let blob;
            if (Platform.OS === 'web') {
              const res = await fetch(uriToUpload);
              blob = await res.blob();
            } else {
              blob = await uriToBlob(uriToUpload);
            }
            await uploadBytes(storageRef, blob);
            if (blob && blob.close) blob.close();
          }

          const downloadUrl = await getDownloadURL(storageRef);
          return downloadUrl;
        })();

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Firebase Storage Upload Timeout")), 15000)
        );

        finalImageUrl = await Promise.race([uploadTask, timeoutPromise]);
      } catch (imgErr) {
        console.warn("Storage upload skipped or timed out, using fallback:", imgErr.message);
        if (outerBase64) {
          finalImageUrl = `data:image/jpeg;base64,${outerBase64}`;
        } else {
          finalImageUrl = dataToSave.imageUri || '';
        }
      }
    }

    const scorePayload = {
      subjectId: subject?.id || '',
      subjectCode: subject?.subjectCode || '',
      subjectName: subject?.subjectName || '',
      studentId: dataToSave?.studentId || '-',
      studentName: dataToSave?.studentName || '',
      score: typeof dataToSave?.score === 'number' ? dataToSave.score : Number(dataToSave?.score || 0),
      maxScore: typeof dataToSave?.maxScore === 'number' ? dataToSave.maxScore : Number(dataToSave?.maxScore || 0),
      totalQuestions: typeof dataToSave?.totalQuestions === 'number' ? dataToSave.totalQuestions : Number(dataToSave?.totalQuestions || 0),
      answers: cleanedAnswers,
      imageUrl: finalImageUrl,
      owner: auth.currentUser?.uid || '',
      createdAt: serverTimestamp(),
    };

    let saved = false;
    let savedDocId = null;
    let isSub = false;

    if (subject?.id) {
      try {
        const docRef = await addDoc(collection(db, 'subjects', subject.id, 'scores'), scorePayload);
        saved = true;
        savedDocId = docRef.id;
        isSub = true;
      } catch (subErr) {
        console.warn("Could not save to subcollection, trying root scores:", subErr.message);
      }
    }

    if (!saved) {
      const docRef = await addDoc(collection(db, "scores"), scorePayload);
      savedDocId = docRef.id;
      isSub = false;
    }
    return { ...scorePayload, id: savedDocId, _isSubcollection: isSub };
  };

  const processBatchImages = async (assets) => {
    const total = assets.length;
    setIsBatchLoading(true);
    setBatchProgress({ current: 0, total, statusText: 'เริ่มต้นตรวจกระดาษคำตอบ...' });
    const results = [];
    const cleanServerUrl = serverUrl.replace(/\/+$/, '');

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      const currentNum = i + 1;
      setBatchProgress({ current: currentNum, total, statusText: `กำลังตรวจรูปที่ ${currentNum}/${total}...` });

      try {
        const portraitUri = await ensurePortraitImage(asset.uri, asset.width, asset.height);

        if (scanMode === 'answer_key') {
          const fileToUpload = await createFormDataFile(portraitUri, `omr_key_${i}.jpg`);
          const formData = new FormData();
          formData.append('file', fileToUpload);

          const data = await uploadFormData(`${cleanServerUrl}/extract_answer_key`, formData);
          setExtractedKeyData(processExtractedKeyData(data.answerKey || {}));
          setKeyModalVisible(true);
          break;
        } else {
          const fileToUpload = await createFormDataFile(portraitUri, `omr_student_${i}.jpg`);
          const formData = new FormData();
          formData.append('file', fileToUpload);

          if (subject?.id) formData.append('subject_id', String(subject.id));
          if (activeSubjectKey && Object.keys(activeSubjectKey).length > 0) {
            formData.append('answer_key', String(JSON.stringify(activeSubjectKey)));
          }

          const data = await uploadFormData(`${cleanServerUrl}/predict`, formData);
          let answers = data.answers || [];
          if ((!answers || answers.length === 0) && data.detections && data.detections.length > 0) {
            answers = data.detections.map((det, idx) => ({
              question: idx + 1,
              selected: det.class_name || `Class ${det.class_id}`,
              status: (det.confidence >= 0.5) ? 'correct' : 'incorrect',
              confidence: det.confidence
            }));
          }

          const totalQuestions = data.totalQuestions || answers.length || 0;
          const score = (data.score !== undefined) ? data.score : answers.filter(a => a.status === 'correct').length;

          const examDataObj = {
            imageUri: portraitUri,
            studentId: data.studentId || '-',
            studentName: data.studentName || '',
            totalQuestions: totalQuestions,
            score: score,
            maxScore: data.maxScore || totalQuestions,
            summary: data.summary || `ตรวจพบ ${answers.length} รายการ`,
            answers: answers,
            detections: data.detections || []
          };

          setBatchProgress({ current: currentNum, total, statusText: `กำลังบันทึกคะแนนรูปที่ ${currentNum}/${total}...` });
          const savedPayload = await saveSingleExamDataToFirestore(examDataObj);

          results.push({
            id: i,
            docId: savedPayload?.id || null,
            isSubcollection: savedPayload?._isSubcollection || false,
            success: true,
            studentId: examDataObj.studentId,
            studentName: examDataObj.studentName,
            score: examDataObj.score,
            maxScore: examDataObj.maxScore,
            imageUri: portraitUri,
            summary: examDataObj.summary,
          });
        }
      } catch (err) {
        console.error(`Batch item ${i} error:`, err);
        results.push({
          id: i,
          success: false,
          errorMsg: err.message,
          imageUri: asset.uri,
        });
      }
    }

    setIsBatchLoading(false);
    if (results.length > 0) {
      setBatchResults(results);
      setBatchModalVisible(true);
    }
  };

  // ===== ฟังก์ชันบันทึกคะแนนลงฐานข้อมูล Firebase Firestore =====
  // 1. ตรวจสอบว่ามีข้อมูลผลตรวจและรหัสนิสิตหรือไม่
  // 2. เรียกฟังก์ชัน saveSingleExamDataToFirestore() เพื่ออัปโหลดรูปและบันทึกลง Firestore
  // 3. ปิด Modal และแสดง Alert แจ้งผลสำเร็จ
  const handleSaveScore = async () => {
    if (!examData) {
      Alert.alert("ข้อผิดพลาด", "ไม่พบข้อมูลผลการตรวจกระดาษคำตอบ");
      return;
    }

    const trimmedStudentId = (examData?.studentId || '').trim();
    if (!trimmedStudentId || trimmedStudentId === '-') {
      Alert.alert(
        "ยังไม่ได้กรอกรหัสนิสิต",
        "กรุณากรอกรหัสนิสิตก่อนบันทึกผลการตรวจข้อสอบ (หรือกดดึงข้อมูลจากฐานข้อมูล / ใช้รหัสของคุณ)"
      );
      return;
    }

    try {
      setIsLoading(true);
      await saveSingleExamDataToFirestore(examData);
      setModalVisible(false);

      Alert.alert(
        "บันทึกผลคะแนนสำเร็จ!",
        `บันทึกผลคะแนนรหัส ${examData?.studentId || '-'} (${examData?.score ?? 0}/${examData?.maxScore ?? 0}) เรียบร้อยแล้ว`,
        [
          {
            text: "ดูรายงานผลคะแนน",
            onPress: () => {
              if (subject) {
                navigation.navigate('Score', { subject });
              }
            }
          },
          { text: "ตกลง", style: "cancel" }
        ]
      );
    } catch (e) {
      console.error("Save score error:", e);
      Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถบันทึกข้อมูลได้: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveServerUrl = () => {
    const formattedUrl = setServerUrlConfig(inputUrl);
    setServerUrl(formattedUrl);
    setServerModalVisible(false);
    Alert.alert("สำเร็จ", `ตั้งค่า Server IPv4 URL เป็น: ${formattedUrl}`);
  };

  const renderModals = () => (
    <>
      {/* Answer Key Review Modal (เมื่อถ่ายรูปเฉลยเสร็จ) */}
      <Modal visible={isKeyModalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="key-outline" size={24} color={COLORS.brown} />
                <Text style={[styles.modalTitle, { color: COLORS.brown }]}>สกัดเฉลยเรียบร้อยแล้ว</Text>
              </View>
              <TouchableOpacity onPress={() => setKeyModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color={COLORS.slate} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.keyInfoCard}>
                <Text style={styles.keyInfoTitle}>
                  สกัดเฉลยได้ทั้งหมด {Object.keys(extractedKeyData).length} ข้อ
                </Text>
                <Text style={styles.keyInfoSubtitle}>
                  สามารถตรวจสอบและปรับแก้ตัวเลือกของแต่ละข้อได้ ก่อนกดบันทึกเป็นเฉลยของวิชานี้
                </Text>
              </View>

              {Object.keys(extractedKeyData)
                .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
                .map((qNum) => {
                const selectedChoice = extractedKeyData[qNum];
                return (
                  <View key={qNum} style={styles.keyQuestionRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 85 }}>
                      <Text style={styles.keyQNumText}>ข้อ {qNum}</Text>
                      {selectedChoice ? (
                        <TouchableOpacity
                          onPress={() => handleClearKeyQuestion(qNum)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Ionicons name="close-circle-outline" size={17} color={COLORS.slate} />
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity
                        onPress={() => handleDeleteKeyQuestionRow(qNum)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="trash-outline" size={17} color={COLORS.error} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.keyChoiceGroup}>
                      {CHOICES.map((c) => {
                        const isSelected = selectedChoice === c;
                        return (
                          <TouchableOpacity
                            key={c}
                            style={[styles.keyChoiceBtn, isSelected && styles.keyChoiceBtnSelected]}
                            onPress={() => handleChoiceChangeInKey(qNum, c)}
                          >
                            <Text style={[styles.keyChoiceText, isSelected && styles.keyChoiceTextSelected]}>
                              {c}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 10 }}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.primaryLight, borderRadius: 8 }}
                  onPress={() => handleAddKeyQuestion(1)}
                >
                  <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: COLORS.primaryDark }}>+ เพิ่ม 1 ข้อ</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.primaryLight, borderRadius: 8 }}
                  onPress={() => handleAddKeyQuestion(5)}
                >
                  <Ionicons name="add-circle" size={18} color={COLORS.primary} />
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: COLORS.primaryDark }}>+ เพิ่ม 5 ข้อ</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setKeyModalVisible(false)}>
                <Text style={styles.cancelBtnText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.addBtn, { backgroundColor: COLORS.brown }]} onPress={handleSaveExtractedKey} disabled={isLoading}>
                {isLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.addBtnText}>บันทึกเป็นเฉลย</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Student Result Modal (เมื่อถ่ายกระดาษนักเรียนเสร็จ) */}
      <Modal visible={isModalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="ribbon-outline" size={24} color={COLORS.primary} />
                <Text style={styles.modalTitle}>ผลการตรวจกระดาษนักเรียน</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color={COLORS.slate} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.studentFormBox}>
                <Text style={styles.studentFormHeaderTitle}>🎓 ข้อมูลนิสิต / นักศึกษา</Text>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={styles.inputLabelText}>รหัสนิสิต (Student ID):</Text>
                  <Text style={{ fontSize: 11, color: COLORS.danger, fontWeight: 'bold' }}>* จำเป็นต้องระบุ</Text>
                </View>
                <TextInput
                  style={[
                    styles.studentInput,
                    (!examData?.studentId || examData?.studentId === '-') && {
                      borderColor: COLORS.danger,
                      borderWidth: 1.5,
                      backgroundColor: '#FFF5F5',
                    }
                  ]}
                  value={examData?.studentId && examData.studentId !== '-' ? examData.studentId : ''}
                  onChangeText={(text) => setExamData(prev => prev ? { ...prev, studentId: text } : null)}
                  placeholder="กรอกรหัสนิสิต (เช่น 65xxxxxxxx)"
                  placeholderTextColor={COLORS.slate}
                  keyboardType="number-pad"
                />
                {(!examData?.studentId || examData?.studentId === '-') && (
                  <Text style={{ fontSize: 12, color: COLORS.danger, marginTop: -4, marginBottom: 8, fontWeight: '500' }}>
                    ⚠️ ยังไม่ได้ระบุรหัสนิสิต (ต้องกรอกก่อนบันทึกคะแนน)
                  </Text>
                )}

                <Text style={styles.inputLabelText}>ชื่อ-นามสกุล (Student Name):</Text>
                <TextInput
                  style={styles.studentInput}
                  value={examData?.studentName || ''}
                  onChangeText={(text) => setExamData(prev => prev ? { ...prev, studentName: text } : null)}
                  placeholder="กรอกชื่อ-นามสกุล (ไม่บังคับ)"
                  placeholderTextColor={COLORS.slate}
                />

                <View style={styles.dbBtnRow}>
                  <TouchableOpacity
                    style={styles.dbActionBtn}
                    onPress={fetchStudentsFromDb}
                  >
                    <Ionicons name="search-outline" size={16} color={COLORS.primaryDark} />
                    <Text style={styles.dbActionBtnText}>ดึงจากฐานข้อมูล</Text>
                  </TouchableOpacity>

                  {auth.currentUser ? (
                    <TouchableOpacity
                      style={styles.dbActionBtnSecondary}
                      onPress={handleUseMyStudentId}
                    >
                      <Ionicons name="person-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.dbActionBtnSecondaryText}>ใช้รหัสของคุณ</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* ===== ส่วนที่ 1: การ์ดสรุปคะแนนสอบ (Score Card) ===== */}
              {/* แสดงคะแนนที่ได้เทียบกับคะแนนเต็ม และข้อความสรุปจาก FastAPI Server */}
              <View style={styles.scoreCard}>
                <View style={styles.scoreRow}>
                  <Text style={styles.scoreLabel}>คะแนนที่ได้</Text>
                  <Text style={styles.scoreValue}>
                    {examData?.score ?? 0} / {examData?.maxScore ?? 0}
                  </Text>
                </View>
                <Text style={styles.summaryText}>{examData?.summary}</Text>
              </View>

              {/* ===== ส่วนที่ 2: กล่องแสดงรูปกระดาษคำตอบที่สแกน (Sheet Preview) ===== */}
              {/* แสดงภาพถ่ายกระดาษคำตอบเพื่อให้คุณครูตรวจเช็กเทียบกับกระดาษจริงได้ทันที */}
              {examData?.imageUri ? (
                <View style={styles.sheetImagePreviewBox}>
                  <Text style={styles.sheetImagePreviewTitle}>📷 รูปกระดาษคำตอบที่สแกน:</Text>
                  <Image source={{ uri: examData.imageUri }} style={styles.sheetImagePreview} resizeMode="contain" />
                </View>
              ) : null}

              {/* ===== ส่วนที่ 3: หัวข้อรายละเอียดคำตอบ ===== */}
              <Text style={styles.sectionTitle}>รายละเอียดคำตอบ</Text>

              {/* ===== ส่วนที่ 4: การแจกแจงผลตรวจทีละข้อ (Answers Breakdown List) ===== */}
              {/* วนลูปอ่านข้อมูลคำตอบทุกข้อ (answers) ที่ได้จาก AI เพื่อแสดง: ข้อ, คำตอบที่ฝน, เฉลย, และป้ายสถานะ ถูก/ผิด */}
              {examData?.answers && examData.answers.length > 0 ? (
                examData.answers.map((item, index) => (
                  <View key={index} style={styles.answerRow}>
                    <Text style={styles.questionText}>ข้อ {item.question}</Text>
                    <View style={styles.answerBadgeContainer}>
                      {/* แสดงคำตอบที่นักเรียนฝน (เช่น ตอบ 1 หรือ หลายตัวเลือก) และเฉลยข้อนั้น */}
                      <Text style={styles.selectedAnswerText}>
                        ตอบ: {item.selected || '-'} {item.expected && item.expected !== '-' ? `(เฉลย ${item.expected})` : ''}
                      </Text>
                      {/* ป้ายแสดงสถานะ: สีเขียวถ้าถูกต้อง (correct), สีแดงถ้าผิด (incorrect) */}
                      <View style={[
                        styles.statusBadge,
                        item.status === 'correct' ? styles.badgeCorrect : styles.badgeIncorrect
                      ]}>
                        <Text style={[
                          styles.statusBadgeText,
                          { color: item.status === 'correct' ? COLORS.primaryDark : COLORS.error }
                        ]}>
                          {item.status === 'correct' ? 'ถูกต้อง' : 'ผิด'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.noAnswerText}>ไม่พบคะแนนในคำตอบ</Text>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>ปิด</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={handleSaveScore} disabled={isLoading}>
                {isLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.addBtnText}>บันทึกคะแนน</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Student Picker Modal (เลือกนิสิตจากฐานข้อมูล) */}
      <Modal visible={isStudentPickerVisible} transparent animationType="slide">
        <View style={styles.configModalContainer}>
          <View style={[styles.configModalContent, { maxHeight: '80%' }]}>
            <View style={styles.configModalHeader}>
              <Ionicons name="people-outline" size={24} color={COLORS.primary} />
              <Text style={styles.configModalTitle}>เลือกนิสิตจากฐานข้อมูล</Text>
            </View>

            <TextInput
              style={styles.urlInput}
              value={studentSearchQuery}
              onChangeText={setStudentSearchQuery}
              placeholder="ค้นหาด้วยรหัสนิสิต หรือ ชื่อ..."
              placeholderTextColor={COLORS.slate}
            />

            {isDbLoading ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 20 }} />
            ) : (
              <ScrollView style={{ maxHeight: 300, marginVertical: 10 }}>
                {dbStudents
                  .filter(st => {
                    const q = studentSearchQuery.toLowerCase().trim();
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
                      style={styles.studentListItem}
                      onPress={() => handleSelectStudent(st)}
                    >
                      <View style={styles.studentAvatarCircle}>
                        <Ionicons name="person" size={18} color={COLORS.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.studentListIdText}>
                          {st.studentId ? `รหัส: ${st.studentId}` : 'ยังไม่ได้ระบุรหัสนิสิต'}
                        </Text>
                        <Text style={styles.studentListNameText}>
                          {st.displayName || st.email || 'ผู้ใช้งาน'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={COLORS.slate} />
                    </TouchableOpacity>
                  ))}

                {dbStudents.length === 0 && (
                  <Text style={{ textAlign: 'center', color: COLORS.slate, marginVertical: 20 }}>
                    ไม่พบข้อมูลนิสิตในฐานข้อมูล
                  </Text>
                )}
              </ScrollView>
            )}

            <View style={styles.configModalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setStudentPickerVisible(false)}
              >
                <Text style={styles.cancelBtnText}>ปิด</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Server Config Modal */}
      <Modal visible={isServerModalVisible} transparent animationType="fade">
        <View style={styles.configModalContainer}>
          <View style={styles.configModalContent}>
            <View style={styles.configModalHeader}>
              <Ionicons name="hardware-chip-outline" size={24} color={COLORS.primary} />
              <Text style={styles.configModalTitle}>ตั้งค่า FastAPI Server</Text>
            </View>
            <Text style={styles.configModalSubtitle}>
              กำหนด IP หรือ URL ของ FastAPI Server ที่รันโมเดล OMR (พอร์ตเริ่มต้นคือ 8000)
            </Text>
            <TextInput
              style={styles.urlInput}
              value={inputUrl}
              onChangeText={setInputUrl}
              placeholder="http://192.168.1.X:8000"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {/* Quick Presets */}
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: COLORS.slate, marginTop: 10, marginBottom: 6 }}>ทางลัดตั้งค่า IP:</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              <TouchableOpacity
                style={{ backgroundColor: COLORS.primaryLight, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: COLORS.primary }}
                onPress={() => setInputUrl('https://omrapi.onrender.com')}
              >
                <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: 'bold' }}>☁️ Render Cloud</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ backgroundColor: COLORS.surfaceVariant, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border }}
                onPress={() => setInputUrl('http://192.168.1.237:8000')}
              >
                <Text style={{ fontSize: 12, color: COLORS.primaryDark, fontWeight: '600' }}>Wi-Fi IP (192.168.1.237)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ backgroundColor: COLORS.surfaceVariant, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border }}
                onPress={() => setInputUrl('http://10.238.167.146:8000')}
              >
                <Text style={{ fontSize: 12, color: COLORS.primaryDark, fontWeight: '600' }}>ZeroTier IP</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ backgroundColor: COLORS.surfaceVariant, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border }}
                onPress={() => setInputUrl('http://127.0.0.1:8000')}
              >
                <Text style={{ fontSize: 12, color: COLORS.primaryDark, fontWeight: '600' }}>Localhost (127.0.0.1)</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.hintText}>
              • Cloud Server (Render): https://omrapi.onrender.com (แนะนำ){'\n'}
              • มือถือ / PC (วง Wi-Fi เดียวกัน): http://192.168.1.237:8000{'\n'}
              • PC Web Browser: http://127.0.0.1:8000
            </Text>
            <View style={styles.configModalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setServerModalVisible(false)}>
                <Text style={styles.cancelBtnText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={handleSaveServerUrl}>
                <Text style={styles.addBtnText}>บันทึก</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Batch Processing Loading Modal */}
      <Modal visible={isBatchLoading} transparent animationType="fade">
        <View style={styles.configModalContainer}>
          <View style={[styles.configModalContent, { alignItems: 'center', paddingVertical: 25 }]}>
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginBottom: 15 }} />
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: COLORS.primary, marginBottom: 8 }}>
              กำลังตรวจและบันทึกคะแนน...
            </Text>
            <Text style={{ fontSize: 14, color: COLORS.slate, marginBottom: 15 }}>
              {batchProgress.statusText}
            </Text>
            <View style={{ width: '100%', height: 8, backgroundColor: COLORS.surfaceVariant, borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
              <View
                style={{
                  height: '100%',
                  backgroundColor: COLORS.primary,
                  width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%`
                }}
              />
            </View>
            <Text style={{ fontSize: 12, color: COLORS.slate, fontWeight: '600' }}>
              โปรดอย่าปิดหน้าจอ จนกว่าระบบจะประมวลผลเสร็จสิ้น
            </Text>
          </View>
        </View>
      </Modal>

      {/* Batch Results Summary Modal */}
      <Modal visible={isBatchModalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="documents-outline" size={24} color={COLORS.primary} />
                <Text style={styles.modalTitle}>สรุปผลการตรวจกระดาษหลายใบ</Text>
              </View>
              <TouchableOpacity onPress={() => setBatchModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color={COLORS.slate} />
              </TouchableOpacity>
            </View>

            <View style={{
              backgroundColor: COLORS.primaryLight,
              padding: 14,
              borderRadius: 12,
              marginBottom: 10,
              borderLeftWidth: 4,
              borderLeftColor: COLORS.primary
            }}>
              <Text style={{ fontSize: 15, fontWeight: 'bold', color: COLORS.primaryDark, marginBottom: 2 }}>
                ตรวจเสร็จสิ้นทั้งหมด {batchResults.length} ใบ
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>
                สำเร็จ {batchResults.filter(r => r.success).length} ใบ • ล้มเหลว {batchResults.filter(r => !r.success).length} ใบ (บันทึกข้อมูลเข้า Firestore แล้ว)
              </Text>
            </View>

            {/* Alert banner when there are unassigned student IDs */}
            {(() => {
              const unassignedCount = batchResults.filter(r => r.success && (!r.studentId || r.studentId === '-')).length;
              if (unassignedCount > 0) {
                return (
                  <View style={{
                    backgroundColor: '#FEF3C7',
                    borderColor: '#F59E0B',
                    borderWidth: 1,
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#92400E' }}>
                        ⚠️ มี {unassignedCount} ใบที่ยังไม่ได้ระบุรหัสนิสิต
                      </Text>
                      <Text style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>
                        กดปุ่มนี้เพื่อเปิดดูรูปและใส่รหัสทีละใบอย่างต่อเนื่อง
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#F59E0B',
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4
                      }}
                      onPress={() => {
                        const firstUnassigned = batchResults.find(r => r.success && (!r.studentId || r.studentId === '-')) || batchResults.find(r => r.success);
                        if (firstUnassigned) {
                          handleOpenBatchEdit(firstUnassigned);
                        }
                      }}
                    >
                      <Ionicons name="create" size={15} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>ระบุรหัสทันที</Text>
                    </TouchableOpacity>
                  </View>
                );
              }
              return null;
            })()}

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              {batchResults.map((item, idx) => {
                const isUnassigned = !item.studentId || item.studentId === '-';
                return (
                  <View
                    key={idx}
                    style={{
                      backgroundColor: COLORS.surface,
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 10,
                      borderWidth: 1,
                      borderColor: item.success ? (isUnassigned ? '#F59E0B' : COLORS.border) : COLORS.errorBackground,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      ...SHADOWS.small
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      {/* Image Thumbnail preview */}
                      {item.imageUri ? (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => setSelectedPreviewImage(item.imageUri)}
                          style={{ position: 'relative' }}
                        >
                          <Image
                            source={{ uri: item.imageUri }}
                            style={{
                              width: 48,
                              height: 48,
                              borderRadius: 8,
                              backgroundColor: '#f1f5f9',
                              borderWidth: 1,
                              borderColor: COLORS.border
                            }}
                            resizeMode="cover"
                          />
                          <View style={{
                            position: 'absolute',
                            bottom: -4,
                            right: -4,
                            backgroundColor: item.success ? COLORS.primary : COLORS.error,
                            borderRadius: 9,
                            width: 18,
                            height: 18,
                            justifyContent: 'center',
                            alignItems: 'center'
                          }}>
                            <Ionicons
                              name={item.success ? "checkmark" : "alert"}
                              size={12}
                              color="#fff"
                            />
                          </View>
                        </TouchableOpacity>
                      ) : (
                        <View style={{
                          width: 42,
                          height: 42,
                          borderRadius: 21,
                          backgroundColor: item.success ? COLORS.secondaryLight : COLORS.errorBackground,
                          justifyContent: 'center',
                          alignItems: 'center'
                        }}>
                          <Ionicons
                            name={item.success ? "checkmark-circle" : "alert-circle"}
                            size={24}
                            color={item.success ? COLORS.primaryDark : COLORS.error}
                          />
                        </View>
                      )}

                      <View style={{ flex: 1, marginLeft: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {item.success ? (
                            isUnassigned ? (
                              <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#B45309' }}>
                                ⚠️ ยังไม่ได้ระบุรหัส (ใบที่ {idx + 1})
                              </Text>
                            ) : (
                              <Text style={{ fontSize: 14, fontWeight: 'bold', color: COLORS.textPrimary }}>
                                รหัส: {item.studentId}
                              </Text>
                            )
                          ) : (
                            <Text style={{ fontSize: 14, fontWeight: 'bold', color: COLORS.error }}>
                              ใบที่ {idx + 1} ไม่สามารถตรวจได้
                            </Text>
                          )}
                        </View>

                        {item.studentName ? (
                          <Text style={{ fontSize: 12, color: COLORS.primaryDark, fontWeight: '600', marginTop: 1 }}>
                            {item.studentName}
                          </Text>
                        ) : null}

                        {item.success ? (
                          <Text style={{ fontSize: 11, color: COLORS.slate, marginTop: 1 }}>
                            {item.summary || 'ตรวจสำเร็จ'}
                          </Text>
                        ) : (
                          <Text style={{ fontSize: 12, color: COLORS.error, marginTop: 1 }} numberOfLines={1}>
                            {item.errorMsg || 'รูปแบบรูปภาพไม่ถูกต้อง'}
                          </Text>
                        )}
                      </View>
                    </View>

                    {item.success && (
                      <View style={{ alignItems: 'flex-end', gap: 6, marginLeft: 8 }}>
                        <View style={{
                          backgroundColor: COLORS.primaryLight,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 8,
                          alignItems: 'center'
                        }}>
                          <Text style={{ fontSize: 14, fontWeight: 'bold', color: COLORS.primaryDark }}>
                            {item.score} / {item.maxScore}
                          </Text>
                          <Text style={{ fontSize: 9, color: COLORS.primary }}>คะแนน</Text>
                        </View>

                        <TouchableOpacity
                          onPress={() => handleOpenBatchEdit(item)}
                          style={{
                            backgroundColor: isUnassigned ? COLORS.primary : COLORS.surfaceVariant,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: isUnassigned ? COLORS.primary : COLORS.border,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 3
                          }}
                        >
                          <Ionicons
                            name="create-outline"
                            size={12}
                            color={isUnassigned ? '#fff' : COLORS.primaryDark}
                          />
                          <Text style={{
                            fontSize: 11,
                            fontWeight: 'bold',
                            color: isUnassigned ? '#fff' : COLORS.primaryDark
                          }}>
                            {isUnassigned ? 'ระบุรหัส' : 'แก้ไข'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setBatchModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>ปิด</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => {
                  setBatchModalVisible(false);
                  if (subject) {
                    navigation.navigate('Score', { subject });
                  }
                }}
              >
                <Text style={styles.addBtnText}>ดูรายงานผลคะแนน</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Batch Item Edit Modal */}
      <Modal visible={Boolean(editingBatchItem)} transparent animationType="fade">
        <View style={styles.configModalContainer}>
          <View style={[styles.configModalContent, { maxHeight: '90%' }]}>
            {(() => {
              const currentIdx = batchResults.findIndex(r => r.id === editingBatchItem?.id);
              const totalCount = batchResults.length;
              const hasPrev = currentIdx > 0;
              const hasNext = currentIdx >= 0 && currentIdx < totalCount - 1;

              return (
                <>
                  <View style={styles.configModalHeader}>
                    <Ionicons name="create-outline" size={24} color={COLORS.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.configModalTitle}>
                        ระบุรหัสนิสิต ใบที่ {currentIdx >= 0 ? currentIdx + 1 : 1} จาก {totalCount} ใบ
                      </Text>
                    </View>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false}>
                    {/* Paper Image Preview */}
                    {editingBatchItem?.imageUri ? (
                      <View style={{ marginBottom: 12 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Text style={{ fontSize: 12, fontWeight: 'bold', color: COLORS.slate }}>
                            📷 รูปกระดาษคำตอบใบนี้ (กดดูภาพเต็มเพื่ออ่านชื่อ/รหัส):
                          </Text>
                          <TouchableOpacity
                            onPress={() => setSelectedPreviewImage(editingBatchItem.imageUri)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                          >
                            <Ionicons name="expand-outline" size={14} color={COLORS.primary} />
                            <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: 'bold' }}>ดูรูปขยาย</Text>
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => setSelectedPreviewImage(editingBatchItem.imageUri)}
                        >
                          <Image
                            source={{ uri: editingBatchItem.imageUri }}
                            style={{
                              width: '100%',
                              height: 160,
                              borderRadius: 8,
                              backgroundColor: '#f1f5f9',
                              borderWidth: 1,
                              borderColor: COLORS.border
                            }}
                            resizeMode="contain"
                          />
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={styles.inputLabelText}>รหัสนิสิต (Student ID):</Text>
                      <Text style={{ fontSize: 11, color: COLORS.danger, fontWeight: 'bold' }}>* จำเป็นต้องระบุ</Text>
                    </View>
                    <TextInput
                      style={[
                        styles.studentInput,
                        (!batchEditStudentId.trim() || batchEditStudentId.trim() === '-') && {
                          borderColor: COLORS.danger,
                          borderWidth: 1.5,
                          backgroundColor: '#FFF5F5',
                        }
                      ]}
                      value={batchEditStudentId}
                      onChangeText={setBatchEditStudentId}
                      placeholder="กรอกรหัสนิสิต (เช่น 65xxxxxxxx)"
                      placeholderTextColor={COLORS.slate}
                      keyboardType="number-pad"
                    />
                    {(!batchEditStudentId.trim() || batchEditStudentId.trim() === '-') && (
                      <Text style={{ fontSize: 12, color: COLORS.danger, marginTop: -4, marginBottom: 8, fontWeight: '500' }}>
                        ⚠️ ยังไม่ได้ระบุรหัสนิสิต (ต้องกรอกก่อนบันทึก)
                      </Text>
                    )}

                    <Text style={styles.inputLabelText}>ชื่อ-นามสกุล (Student Name):</Text>
                    <TextInput
                      style={styles.studentInput}
                      value={batchEditStudentName}
                      onChangeText={setBatchEditStudentName}
                      placeholder="กรอกชื่อ-นามสกุล (ไม่บังคับ)"
                      placeholderTextColor={COLORS.slate}
                    />

                    {/* Inline DB Picker Button */}
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        backgroundColor: COLORS.primaryLight,
                        paddingVertical: 10,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: COLORS.primary,
                        marginTop: 10,
                      }}
                      onPress={() => {
                        if (dbStudents.length === 0) {
                          fetchStudentsFromDb(false);
                        }
                        setShowBatchDbPicker(prev => !prev);
                      }}
                    >
                      <Ionicons name="people" size={16} color={COLORS.primaryDark} />
                      <Text style={{ fontSize: 12, fontWeight: 'bold', color: COLORS.primaryDark }}>
                        {showBatchDbPicker ? 'ซ่อนรายชื่อนิสิตในระบบ' : '🔍 ดึงรายชื่อนิสิตจากฐานข้อมูล'}
                      </Text>
                    </TouchableOpacity>

                    {showBatchDbPicker && (
                      <View style={{
                        marginTop: 10,
                        padding: 10,
                        backgroundColor: COLORS.surfaceVariant,
                        borderRadius: 10,
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
                          value={batchDbSearchQuery}
                          onChangeText={setBatchDbSearchQuery}
                          placeholder="พิมพ์รหัส หรือ ชื่อ เพื่อค้นหา..."
                          placeholderTextColor={COLORS.slate}
                        />

                        {isDbLoading ? (
                          <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 10 }} />
                        ) : (
                          <View style={{ maxHeight: 160 }}>
                            <ScrollView nestedScrollEnabled={true}>
                              {dbStudents
                                .filter(st => {
                                  const q = batchDbSearchQuery.toLowerCase().trim();
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
                                    onPress={() => handleSelectBatchStudent(st)}
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

                  {/* Navigation & Action Footer */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                    {hasPrev && (
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          height: 44,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          justifyContent: 'center',
                          alignItems: 'center',
                          backgroundColor: COLORS.surfaceVariant
                        }}
                        onPress={handleBatchEditPrev}
                      >
                        <Text style={{ fontSize: 13, color: COLORS.textPrimary, fontWeight: 'bold' }}>‹ ใบก่อนหน้า</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={{
                        flex: 1,
                        height: 44,
                        borderRadius: 10,
                        backgroundColor: hasNext ? COLORS.secondary : COLORS.primary,
                        justifyContent: 'center',
                        alignItems: 'center'
                      }}
                      onPress={() => handleSaveBatchEdit(false)}
                    >
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>บันทึก</Text>
                    </TouchableOpacity>

                    {hasNext && (
                      <TouchableOpacity
                        style={{
                          flex: 1.4,
                          height: 44,
                          borderRadius: 10,
                          backgroundColor: COLORS.primary,
                          justifyContent: 'center',
                          alignItems: 'center',
                          flexDirection: 'row',
                          gap: 4
                        }}
                        onPress={() => handleSaveBatchEdit(true)}
                      >
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>บันทึก & ใบถัดไป ›</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <TouchableOpacity
                    style={{ marginTop: 8, paddingVertical: 8, alignItems: 'center' }}
                    onPress={() => {
                      setEditingBatchItem(null);
                      setShowBatchDbPicker(false);
                    }}
                  >
                    <Text style={{ color: COLORS.slate, fontSize: 13, fontWeight: '600' }}>ปิดหน้าต่างนี้</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Fullscreen Preview Image Viewer Modal */}
      <Modal
        visible={Boolean(selectedPreviewImage)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPreviewImage(null)}
      >
        <View style={styles.imageViewerOverlay}>
          <SafeAreaView style={styles.imageViewerHeader}>
            <Text style={styles.imageViewerTitle}>รูปกระดาษคำตอบ</Text>
            <TouchableOpacity
              style={styles.closeViewerBtn}
              onPress={() => setSelectedPreviewImage(null)}
            >
              <Ionicons name="close" size={28} color="white" />
            </TouchableOpacity>
          </SafeAreaView>
          <View style={styles.imageViewerBody}>
            {selectedPreviewImage ? (
              <Image
                source={{ uri: selectedPreviewImage }}
                style={styles.imageViewerImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );

  if (!permission) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
        {/* Top Header */}
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: COLORS.surface,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
          ...SHADOWS.small
        }}>
          <TouchableOpacity style={{ padding: 4 }} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>

          <Text style={{ fontSize: 18, fontWeight: "bold", color: COLORS.textPrimary }}>
            สแกนกระดาษคำตอบ
          </Text>

          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: COLORS.primaryLight,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: COLORS.primary,
              gap: 4
            }}
            onPress={() => {
              setInputUrl(serverUrl);
              setServerModalVisible(true);
            }}
          >
            <Ionicons name="settings-outline" size={16} color={COLORS.primary} />
            <Text style={{ fontSize: 12, fontWeight: "bold", color: COLORS.primaryDark }}>ตั้งค่า IP</Text>
          </TouchableOpacity>
        </View>

        {/* Center Content */}
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={54} color={COLORS.slate} style={{ marginBottom: 12 }} />
          <Text style={{ textAlign: "center", marginBottom: 20, fontSize: 15, color: COLORS.textSecondary, maxWidth: 340, lineHeight: 22 }}>
            จำเป็นต้องเข้าถึงกล้องถ่ายรูปเพื่อสแกนกระดาษคำตอบ OMR
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
            <Text style={{ color: "white", fontWeight: "bold" }}>อนุญาตใช้งานกล้อง</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isKeyMode = scanMode === "answer_key";

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="black" />

      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        onCameraReady={() => setIsCameraReady(true)}
      >
        {/* Top Header */}
        <View style={styles.topHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>

          {/* Mode Switcher Segmented Buttons */}
          <View style={styles.modeSegmentContainer}>
            <TouchableOpacity
              style={[styles.modeSegmentBtn, isKeyMode && styles.modeSegmentBtnActiveKey]}
              onPress={() => setScanMode("answer_key")}
            >
              <Ionicons name="key-outline" size={14} color={isKeyMode ? "white" : "rgba(255,255,255,0.7)"} />
              <Text style={[styles.modeSegmentText, isKeyMode && styles.modeSegmentTextActive]}>
                เฉลย
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeSegmentBtn, !isKeyMode && styles.modeSegmentBtnActiveStudent]}
              onPress={() => setScanMode("student")}
            >
              <Ionicons name="document-text-outline" size={14} color={!isKeyMode ? COLORS.primaryDark : "rgba(255,255,255,0.7)"} />
              <Text style={[styles.modeSegmentText, !isKeyMode && styles.modeSegmentTextActiveStudent]}>
                กระดาษคำตอบ
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => {
              setInputUrl(serverUrl);
              setServerModalVisible(true);
            }}
          >
            <Ionicons name="settings-outline" size={20} color="white" />
          </TouchableOpacity>
        </View>

        {/* Mode Banner */}
        <View style={styles.modeBannerContainer}>
          <View style={[styles.modeBannerBadge, isKeyMode ? styles.modeBannerKey : styles.modeBannerStudent]}>
            <Ionicons name={isKeyMode ? "key-outline" : "document-text-outline"} size={16} color="white" />
            <Text style={styles.modeBannerText}>
              {isKeyMode ? "โหมดถอดเฉลย (Answer Key)" : ("โหมดตรวจคำตอบ" + (subject ? `: ${subject.subjectName}` : ""))}
            </Text>
          </View>
        </View>

        {/* Scanner Overlay Frame */}
        <View style={styles.overlay}>
          <View
            style={[
              frameOrientation === 'portrait' ? styles.scannerFramePortrait : styles.scannerFrameLandscape,
              isKeyMode ? styles.scannerFrameKey : styles.scannerFrameStudent
            ]}
          />
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.galleryBtn}
            onPress={pickImage}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            <Ionicons name="images-outline" size={26} color="white" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shutterBtn, isKeyMode && { borderColor: COLORS.yellow }]}
            onPress={takePhoto}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            <View style={[styles.shutterInner, isKeyMode && { backgroundColor: COLORS.yellow }]}>
              {isLoading ? (
                <ActivityIndicator color={COLORS.primary} size="large" />
              ) : (
                <Ionicons name={isKeyMode ? "key" : "camera"} size={32} color={COLORS.primary} />
              )}
            </View>
          </TouchableOpacity>

          {/* ปุ่มสลับถ่ายรูปแนวตั้ง / แนวนอน ข้างปุ่มถ่ายรูป */}
          <TouchableOpacity
            style={styles.orientationToggleBtn}
            onPress={() => setFrameOrientation(prev => prev === 'portrait' ? 'landscape' : 'portrait')}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            <Ionicons
              name={frameOrientation === 'portrait' ? "phone-portrait-outline" : "phone-landscape-outline"}
              size={20}
              color="white"
            />
            <Text style={styles.orientationToggleText}>
              {frameOrientation === 'portrait' ? 'แนวตั้ง' : 'แนวนอน'}
            </Text>
          </TouchableOpacity>
        </View>
      </CameraView>

      {renderModals()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: COLORS.background },
  camera: { flex: 1 },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 8 : 36,
    zIndex: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  settingsBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modeSegmentContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  modeSegmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  modeSegmentBtnActiveKey: {
    backgroundColor: COLORS.brown,
  },
  modeSegmentBtnActiveStudent: {
    backgroundColor: COLORS.secondary,
  },
  modeSegmentText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: "bold",
  },
  modeSegmentTextActive: {
    color: "white",
  },
  modeSegmentTextActiveStudent: {
    color: COLORS.primaryDark,
  },
  modeBannerContainer: {
    alignItems: "center",
    marginTop: 10,
    zIndex: 9,
  },
  modeBannerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    ...SHADOWS.small,
  },
  modeBannerKey: {
    backgroundColor: COLORS.brown,
  },
  modeBannerStudent: {
    backgroundColor: COLORS.primary,
  },
  modeBannerText: {
    color: "white",
    fontSize: 13,
    fontWeight: "bold",
  },
  overlay: { flex: 1, backgroundColor: "transparent", justifyContent: "center", alignItems: "center" },
  scannerFrame: {
    width: width * 0.88,
    height: width * 0.65,
    borderWidth: 3,
    borderRadius: 20,
  },
  scannerFramePortrait: {
    width: width * 0.82,
    height: Math.min(height * 0.58, width * 1.35),
    borderWidth: 3,
    borderRadius: 20,
  },
  scannerFrameLandscape: {
    width: width * 0.88,
    height: width * 0.65,
    borderWidth: 3,
    borderRadius: 20,
  },
  scannerFrameKey: {
    borderColor: COLORS.yellow,
    backgroundColor: "rgba(255, 216, 0, 0.08)",
  },
  scannerFrameStudent: {
    borderColor: COLORS.secondary,
    backgroundColor: "rgba(178, 187, 30, 0.08)",
  },
  scanText: { color: "white", marginTop: 16, fontSize: 14, fontWeight: "600", textAlign: "center", backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  controls: {
    position: "absolute",
    bottom: 30,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 40,
  },
  galleryBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  shutterBtn: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: "rgba(255,255,255,0.8)", justifyContent: "center", alignItems: "center" },
  shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.yellow, justifyContent: "center", alignItems: "center" },
  orientationToggleBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.4)",
  },
  orientationToggleText: {
    color: "white",
    fontSize: 9,
    fontWeight: "bold",
    marginTop: 2,
  },

  // Key Review Modal Styles
  keyInfoCard: {
    backgroundColor: COLORS.brownLight,
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.brown,
  },
  keyInfoTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.brown,
    marginBottom: 4,
  },
  keyInfoSubtitle: {
    fontSize: 13,
    color: COLORS.textPrimary,
    lineHeight: 18,
  },
  keyQuestionRow: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  keyQNumText: {
    fontSize: 15,
    fontWeight: "bold",
    color: COLORS.textPrimary,
    width: 60,
  },
  keyChoiceGroup: {
    flexDirection: "row",
    gap: 6,
  },
  keyChoiceBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.surfaceVariant,
  },
  keyChoiceBtnSelected: {
    backgroundColor: COLORS.brown,
    borderColor: COLORS.brown,
  },
  keyChoiceText: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.textPrimary,
  },
  keyChoiceTextSelected: {
    color: "white",
  },

  // General Modal Styles
  configModalContainer: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  configModalContent: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 20 },
  configModalHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  configModalTitle: { fontSize: 18, fontWeight: "bold", color: COLORS.primary },
  configModalSubtitle: { fontSize: 14, color: COLORS.slate, marginBottom: 15, lineHeight: 20 },
  urlInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, backgroundColor: COLORS.surfaceVariant, marginBottom: 10, color: COLORS.textPrimary },
  hintText: { fontSize: 12, color: COLORS.slate, marginBottom: 20, lineHeight: 18 },
  configModalFooter: { flexDirection: "row", gap: 12 },
  modalContainer: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 },
  modalHeaderTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: COLORS.primary },
  scoreCard: {
    backgroundColor: COLORS.primaryLight,
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
    borderLeftWidth: 5,
    borderLeftColor: COLORS.primary,
  },
  studentIdText: { fontSize: 14, color: COLORS.slate, fontWeight: "500", marginBottom: 8 },
  scoreRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  scoreLabel: { fontSize: 18, fontWeight: "bold", color: COLORS.primary },
  scoreValue: { fontSize: 24, fontWeight: "bold", color: COLORS.primaryDark },
  summaryText: { fontSize: 14, color: COLORS.textPrimary, marginTop: 6, fontWeight: "500" },
  sheetImagePreviewBox: {
    marginVertical: 12,
    borderRadius: 12,
    backgroundColor: "#FAFBFB",
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  sheetImagePreviewTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.slate,
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  sheetImagePreview: {
    width: "100%",
    height: 180,
    borderRadius: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: COLORS.textPrimary, marginBottom: 10 },
  answerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  questionText: { fontSize: 15, fontWeight: "500", color: COLORS.textPrimary },
  answerBadgeContainer: { flexDirection: "row", alignItems: "center", gap: 10 },
  selectedAnswerText: { fontSize: 14, fontWeight: "bold", color: COLORS.slate },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeCorrect: { backgroundColor: COLORS.secondaryLight },
  badgeIncorrect: { backgroundColor: COLORS.errorBackground },
  statusBadgeText: { fontSize: 12, fontWeight: "bold" },
  noAnswerText: { textAlign: "center", color: COLORS.slate, marginVertical: 20 },
  modalFooter: { flexDirection: "row", marginTop: 20, gap: 12 },
  cancelBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.surfaceVariant },
  cancelBtnText: { color: COLORS.slate, fontSize: 16, fontWeight: "600" },
  addBtn: { flex: 1, height: 48, borderRadius: 12, backgroundColor: COLORS.primary, justifyContent: "center", alignItems: "center", ...SHADOWS.small },
  addBtnText: { color: "white", fontSize: 16, fontWeight: "bold" },
  primaryBtn: { backgroundColor: COLORS.primary, padding: 15, borderRadius: 12 },

  // Student Form & Database Picker Styles
  studentFormBox: {
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  studentFormHeaderTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.primaryDark,
    marginBottom: 10,
  },
  inputLabelText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.slate,
    marginBottom: 4,
    marginTop: 6,
  },
  studentInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: COLORS.surfaceVariant,
    color: COLORS.textPrimary,
  },
  dbBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  dbActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primaryLight,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  dbActionBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.primaryDark,
  },
  dbActionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceVariant,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dbActionBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  studentListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  studentAvatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentListIdText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.primaryDark,
  },
  studentListNameText: {
    fontSize: 12,
    color: COLORS.slate,
  },
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
    justifyContent: 'space-between',
  },
  imageViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 20) + 10 : 20,
    paddingBottom: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  imageViewerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  closeViewerBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  imageViewerBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  imageViewerImage: {
    width: '100%',
    height: '100%',
  },
});

export default ScanScreen;
