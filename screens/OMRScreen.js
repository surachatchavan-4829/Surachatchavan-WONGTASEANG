import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, 
  TouchableOpacity, ActivityIndicator, Platform, StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// นำเข้าโมดูล Firestore และ Authentication
import { db, auth } from '../firebaseConfig';
import { collection, query, where, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SHADOWS } from '../theme';

/**
 * MealCategory: คอมโพเนนต์ย่อยสำหรับแสดงการ์ดรายการข้อมูลในแต่ละหมวดหมู่
 * @param {string} title - ชื่อหมวดหมู่ (เช่น มื้อเช้า, มื้อเที่ยง, มื้อเย็น)
 * @param {Array} data - รายการข้อมูลในหมวดหมู่นั้นๆ
 * @param {string|number} totalCal - ยอดรวมของหมวดหมู่
 * @param {function} onDelete - ฟังก์ชัน callback สำหรับกดลบรายการ
 */
const MealCategory = ({ title, data, totalCal, onDelete }) => (
  <View style={styles.card}>
    {/* ส่วนหัวการ์ด: แสดงชื่อหมวดและยอดรวม */}
    <View style={styles.cardHeader}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.calTotal}>{`${totalCal} kcal`}</Text>
    </View>

    {/* วนลูปแสดงผลรายการแต่ละรายการในหมวดหมู่ */}
    {data.map(item => {
      let calorieText = '... kcal';
      let calStyle = styles.mealCalPending;

      // ตรวจสอบสถานะการประมวลผลของรายการ
      if (item.status === 'completed' && item.calories !== null) {
        calorieText = `${item.calories} kcal`;
        calStyle = styles.mealCalDone;
      } else if (item.status === 'error') {
        calorieText = 'Error';
        calStyle = styles.mealCalError;
      } else if (item.status === 'pending') {
        calorieText = 'Calculating...';
      }

      return (
        <View key={item.id} style={styles.mealItem}>
          {/* ชื่อรายการ */}
          <Text style={styles.mealName}>{item.foodName}</Text>
          <View style={styles.mealDetail}>
            {/* ป้ายแสดงค่าตัวเลขพร้อมสไตล์ตามสถานะ */}
            <Text style={[styles.mealCalBase, calStyle]}>{calorieText}</Text>
            
            {/* ปุ่มไอคอนถังขยะสำหรับลบรายการ */}
            <TouchableOpacity onPress={() => onDelete(item.id)}>
              <Ionicons name="trash" size={20} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        </View>
      );
    })}
  </View>
);

/**
 * OMRScreen: หน้าจอแสดงผลสรุปข้อมูล (Summary / Dashboard Screen)
 * ดึงข้อมูลที่บันทึกไว้ใน Firestore ตาม User ID แบบ Real-time มาคำนวณและแสดงผลสรุป
 * @param {object} navigation - อ็อบเจกต์สำหรับสั่งการนำทางไปยังหน้าจออื่น
 */
export default function OMRScreen({ navigation }) {
  // สถานะกำลังโหลดข้อมูล
  const [loading, setLoading] = useState(true);
  
  // State แยกข้อมูลตามหมวดหมู่
  const [breakfast, setBreakfast] = useState([]);
  const [lunch, setLunch] = useState([]);
  const [dinner, setDinner] = useState([]);

  // State เก็บผลรวมค่าต่างๆ
  const [totalCalories, setTotalCalories] = useState(0);
  const [totalBreakfast, setTotalBreakfast] = useState(0);
  const [totalLunch, setTotalLunch] = useState(0);
  const [totalDinner, setTotalDinner] = useState(0);
  const goalCalories = 2000; // เป้าหมายมาตรฐาน
  
  /**
   * useFocusEffect: ทำงานทุกครั้งที่ผู้ใช้สลับมาเปิดหน้านี้
   * ดึงข้อมูลจาก Firestore collection "meals" เฉพาะของ user ปัจจุบัน (where userId == uid) แบบ Real-time (onSnapshot)
   */
  useFocusEffect(
    React.useCallback(() => {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) { setLoading(false); return; }

      // Query เฉพาะรายการที่เป็นของ User คนนี้
      const q = query(collection(db, "meals"), where("userId", "==", user.uid));
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const mealsData = [];
        querySnapshot.forEach((doc) => {
          mealsData.push({ id: doc.id, ...doc.data() });
        });

        // แยกข้อมูลออกเป็นแต่ละหมวดหมู่
        const breakfastData = mealsData.filter(m => m.mealType === 'มื้อเช้า');
        const lunchData = mealsData.filter(m => m.mealType === 'มื้อเที่ยง');
        const dinnerData = mealsData.filter(m => m.mealType === 'มื้อเย็น');
        
        setBreakfast(breakfastData);
        setLunch(lunchData);
        setDinner(dinnerData);

        // ฟังก์ชันคำนวณผลรวม
        const calcTotal = (arr) => arr.reduce((sum, item) => {
          return sum + (item.calories || 0); 
        }, 0);

        const breakfastCal = calcTotal(breakfastData);
        const lunchCal = calcTotal(lunchData);
        const dinnerCal = calcTotal(dinnerData);

        setTotalBreakfast(breakfastCal);
        setTotalLunch(lunchCal);
        setTotalDinner(dinnerCal);
        setTotalCalories(breakfastCal + lunchCal + dinnerCal);

        setLoading(false);
      }, (error) => {
        console.error("Error fetching meals: ", error);
        setLoading(false);
      });

      // คืนค่าฟังก์ชันเพื่อยกเลิกการดักฟังสัญญาณเมื่อออกจากหน้า
      return () => unsubscribe();
    }, [])
  );

  /**
   * handleDelete: ฟังก์ชันลบรายการออกจาก Firestore
   * @param {string} id - Document ID ที่ต้องการลบ
   */
  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, "meals", id));
    } catch (e) { console.error("Error deleting document: ", e); }
  };

  // คำนวณค่าคงเหลือเทียบกับเป้าหมาย
  const remaining = goalCalories - totalCalories;

  return (
    <SafeAreaView style={styles.container}>
      {/* แถบสถานะด้านบน */}
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      {/* ===== 1. แถบหัวข้อด้านบน (Top Header) ===== */}
      <View style={styles.topHeader}>
        <Text style={styles.headerTitle}>สรุปข้อมูล OMR</Text>
      </View>

      {/* ===== 2. พื้นที่คอนเทนต์แบบเลื่อนได้ (Scroll Content) ===== */}
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* การ์ดสรุปภาพรวม Goal / Consumed / Remaining */}
        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Calories Goal</Text>
            <Text style={styles.summaryValue}>{`${totalCalories.toFixed(0)} / ${goalCalories} kcal`}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Consumed:</Text>
            <Text style={styles.summaryValue}>{`${totalCalories.toFixed(0)}`}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Remaining:</Text>
            <Text style={styles.summaryValue}>{`${remaining.toFixed(0)}`}</Text>
          </View>
        </View>

        {/* แสดงผลรายการ: ถ้ากำลังโหลดให้แสดง ActivityIndicator */}
        {loading ? ( 
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} />
        ) : (
          <>
            <MealCategory 
              title="มื้อเช้า" 
              data={breakfast} 
              totalCal={totalBreakfast.toFixed(0)}
              onDelete={handleDelete}
            />
            <MealCategory 
              title="มื้อเที่ยง" 
              data={lunch} 
              totalCal={totalLunch.toFixed(0)}
              onDelete={handleDelete}
            />
            <MealCategory 
              title="มื้อเย็น" 
              data={dinner} 
              totalCal={totalDinner.toFixed(0)}
              onDelete={handleDelete}
            />
          </>
        )}
      </ScrollView>
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

  // แถบ Header หลักด้านบน
  topHeader: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textLight,
  },

  scrollContainer: {
    padding: 20,
    paddingBottom: 100,
  },

  // สไตล์การ์ดข้อมูลสีขาวขอบมน
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  summaryLabel: {
    fontSize: 16,
    color: COLORS.slate,
    fontWeight: '500',
  },

  summaryValue: {
    fontSize: 16,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 10,
    marginBottom: 10,
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },

  calTotal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary, 
  },

  mealItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },

  mealName: {
    fontSize: 16,
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: 10,
  },

  mealDetail: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  mealCalBase: {
    fontSize: 13,
    color: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 10,
    overflow: 'hidden', 
    minWidth: 50,
    textAlign: 'center',
  },

  // สไตล์ตามสถานะต่างๆ
  mealCalPending: {
    backgroundColor: COLORS.slate,
    color: '#fff',
  },

  mealCalDone: {
    backgroundColor: COLORS.secondaryLight,
    color: COLORS.primaryDark,
  },

  mealCalError: {
    backgroundColor: COLORS.errorBackground,
    color: COLORS.error,
  },
});