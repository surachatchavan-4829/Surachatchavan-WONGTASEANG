/**
 * theme.js
 * ชุดการตั้งค่าธีมสีและเงา (Design Tokens) สำหรับการออกแบบ UI ทั่วทั้งแอปพลิเคชัน
 * คุมโทนสีเขียวหัวเป็ด Teal (#006664), มะกอก Olive (#B2BB1E), และเทา Slate (#74787B)
 */
export const COLORS = {
  // โทนสีหลัก (Primary Palette)
  primary: '#006664',       // สีเขียวหัวเป็ดหลัก (แถบ Header, ปุ่มหลัก, แบรนด์)
  primaryDark: '#004D4B',   // สีเขียวเข้ม (สถานะปุ่มตอนกด หรือพื้นหลังเข้ม)
  primaryLight: '#E0F2F1',  // สีเขียวอ่อนพาสเทล (พื้นหลังไฮไลต์/ไอคอน)
  
  // โทนสีรองและสีเน้น (Accent & Secondary)
  secondary: '#B2BB1E',     // สีเขียวมะกอก (ป้ายสถานะ Badge, จุดเด่น)
  secondaryLight: '#F5F7D6',// สีเขียวมะกอกอ่อน (พื้นหลัง Badge)
  
  // โทนสีเทากลาง (Slate Neutral)
  slate: '#74787B',         // สีเทากลาง (ข้อความรอง, คำอธิบายย่อย, เส้นขอบ)
  slateLight: '#F0F2F3',    // สีเทาอ่อน (พื้นหลังช่องกรอกข้อมูล, การ์ดรอง)
  
  // โทนสีน้ำตาลอบอุ่น (Warm Brown)
  brown: '#6E4B32',         // สีน้ำตาล (การ์ดหัวข้อพิเศษ)
  brownLight: '#F7F2EE',    // สีน้ำตาลอ่อนมาก
  
  // โทนสีเหลืองเด่น (Vibrant Yellow)
  yellow: '#FFD800',        // สีเหลืองทอง (ปุ่ม Floating Action Button, จุดแจ้งเตือน)
  yellowDark: '#E5C200',    // สีเหลืองตอนกด
  
  // สีพื้นหลังและพื้นผิว (Backgrounds & Surfaces)
  background: '#F4F7F6',    // สีพื้นหลังหน้าจอหลัก (Modern Off-White)
  surface: '#FFFFFF',       // สีพื้นหลังการ์ดและ Modal
  surfaceVariant: '#EFEFEF',// สีพื้นผิวรอง
  
  // สีตัวอักษร (Typography)
  textPrimary: '#1A2526',   // ตัวหนังสือเข้ม คมชัด สำหรับหัวข้อหลัก
  textSecondary: '#74787B', // ตัวหนังสือสีเทา สำหรับคำอธิบาย
  textLight: '#FFFFFF',     // ตัวหนังสือสีขาว สำหรับพื้นหลังสีเข้ม
  
  // สีสถานะผลลัพธ์ (Status Colors)
  success: '#2E7D32',       // สีเขียวเมื่อสำเร็จ/ถูกต้อง
  successBackground: '#E8F5E9',
  error: '#D9381E',         // สีแดงเมื่อผิดพลาด/ข้อความแจ้งเตือนสำคัญ
  errorBackground: '#FFEBEE',
  border: '#E0E4E5',        // สีเส้นขอบทั่วไป
};

// รูปแบบเงา (Shadow Styles) สำหรับมิติความลึก (Elevation)
export const SHADOWS = {
  // เงาขนาดเล็ก สำหรับไอเทมรายการหรือปุ่มย่อย
  small: {
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  // เงาขนาดกลาง สำหรับการ์ดเนื้อหา
  medium: {
    elevation: 4,
    shadowColor: '#006664',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  // เงาขนาดใหญ่ สำหรับ Modal, แถบ Navigation หรือ FAB
  large: {
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
};

