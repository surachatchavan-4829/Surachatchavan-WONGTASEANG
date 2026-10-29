const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// เริ่มต้น Firebase Admin
admin.initializeApp();

// --- 1. ตั้งค่า Gemini ---
// ดึง API Key ที่เราตั้งค่าไว้ (วิธีที่ปลอดภัย)
const genAI = new GoogleGenerativeAI(functions.config().gemini.key);

// เลือกโมเดล (ใช้ 1.5 Pro ล่าสุด)
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
const db = admin.firestore();

// --- 2. สร้าง Function ---
// นี่คือ Function ที่จะถูกเรียกอัตโนมัติ
// เมื่อมีเอกสารใหม่ถูกสร้าง (onCreate) ใน collection 'meals'
exports.calculateMealCalories = functions.firestore
  .document("meals/{mealId}") // {mealId} คือ wildcard
  .onCreate(async (snapshot, context) => {
    
    // 3. ดึงข้อมูลและ ID
    const data = snapshot.data();
    const mealId = context.params.mealId;

    // 4. ตรวจสอบสถานะ (ถ้าไม่ใช่ pending ไม่ต้องทำ)
    if (data.status !== "pending" || !data.foodName) {
      console.log(`[${mealId}] Skipped. Status: ${data.status}`);
      return null;
    }

    console.log(`[${mealId}] Processing: ${data.foodName}`);

    try {
      // 5. สร้าง Prompt ที่จะส่งให้ Gemini
      const foodName = data.foodName;
      // รวม array วัตถุดิบเป็น string
      const ingredients = data.ingredients.join(", "); 
      
      const prompt = `
        Calculate the estimated calories for the following meal:
        - Meal Name: ${foodName}
        - Ingredients: ${ingredients}
        
        Based on this, please provide only the estimated total calorie number.
        Do not add "kcal", units, or any other text. Just the number.
        Example: 550
      `;

      // 6. เรียก Gemini API
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim();

      // 7. แปลงผลลัพธ์เป็นตัวเลข
      const calories = parseInt(text, 10);

      // ถ้า Gemini ไม่ได้ตอบเป็นตัวเลข (เช่น "I cannot calculate this.")
      if (isNaN(calories)) {
        throw new Error(`Gemini response was not a number: ${text}`);
      }

      console.log(`[${mealId}] Calories: ${calories}`);

      // 8. อัปเดตกลับไปที่ Firestore
      return snapshot.ref.update({
        calories: calories,
        status: "completed",
      });

    } catch (error) {
      console.error(`[${mealId}] Error:`, error);
      
      // 9. อัปเดตถ้าเกิด Error
      return snapshot.ref.update({
        status: "error",
        errorMessage: error.message || "An unknown error occurred.",
        calories: null,
      });
    }
  });