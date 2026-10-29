from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import shutil
import os
import uuid
import json
from typing import Optional, Dict
from PIL import Image, ImageOps

import cv2

app = FastAPI(title="OMR React Native API", version="2.0.0")

def preprocess_image_orientation(filepath: str):
    """
    ปรับหมุนภาพตามค่า EXIF และเพิ่มความคมชัดของภาพอัตโนมัติ (Contrast Enhancement):
    1. หมุนภาพตามค่า EXIF (exif_transpose) เพื่อให้ระนาบภาพถูกต้อง
    2. ปรับ Contrast ด้วย CLAHE (Contrast Limited Adaptive Histogram Equalization)
       เพื่อขับรอยฝนดินสอให้เข้มชัด แยกออกจากพื้นกระดาษขาว แม้ถ่ายในที่แสงน้อยหรือมีเงาตกกระทบ
    """
    try:
        # 1. หมุนภาพตามทิศทาง EXIF
        with Image.open(filepath) as img:
            transposed = ImageOps.exif_transpose(img)
            if transposed.mode != "RGB":
                transposed = transposed.convert("RGB")
            transposed.save(filepath)

        # 2. ปรับ Contrast ด้วย CLAHE ในปริภูมิสี LAB (ปรับเฉพาะความสว่างช่อง L)
        img_bgr = cv2.imread(filepath)
        if img_bgr is not None:
            lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            cl = clahe.apply(l)
            enhanced = cv2.cvtColor(cv2.merge((cl, a, b)), cv2.COLOR_LAB2BGR)
            cv2.imwrite(filepath, enhanced)
    except Exception as e:
        print(f"Image preprocessing warning: {e}")

# อนุญาตให้ React Native จากทุก origin / IP สามารถเชื่อมต่อได้
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# กำหนด Base Directory ของ Server
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# โหลดโมเดล YOLO OMR
MODEL_PATH = os.path.join(BASE_DIR, "best.pt")
if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(f"ไม่พบไฟล์โมเดล {MODEL_PATH}")

model = YOLO(MODEL_PATH)

UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ANSWER_KEY_PATH = os.path.join(BASE_DIR, "answer_key.json")


def load_all_answer_keys() -> Dict[str, dict]:
    """โหลดเฉลยคำตอบทั้งหมดจาก answer_key.json บน Disk"""
    if os.path.exists(ANSWER_KEY_PATH):
        try:
            with open(ANSWER_KEY_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    # โครงสร้างแบบรองรับหลายวิชา {"subjects": {...}, "default": {...}}
                    if "subjects" in data and isinstance(data["subjects"], dict):
                        result = dict(data["subjects"])
                        if "default" in data and isinstance(data["default"], dict):
                            result["default"] = data["default"]
                        return result
                    # โครงสร้างแบบ Legacy ทั่วไป {"1": "1", "2": "2"}
                    elif all(isinstance(v, (str, int)) for v in data.values()):
                        return {"default": data}
                    else:
                        return data
        except Exception as e:
            print(f"Error loading answer key file: {e}")
    return {}


def save_all_answer_keys(keys_data: Dict[str, dict]):
    """บันทึกเฉลยคำตอบทั้งหมดลงไฟล์ answer_key.json"""
    try:
        save_data = {
            "subjects": {k: v for k, v in keys_data.items() if k != "default"},
            "default": keys_data.get("default", {})
        }
        with open(ANSWER_KEY_PATH, "w", encoding="utf-8") as f:
            json.dump(save_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving answer key file: {e}")


# โหลดเฉลยที่มีอยู่เข้า Memory
SAVED_ANSWER_KEYS: Dict[str, dict] = load_all_answer_keys()


def load_answer_key(subject_id: str = "default") -> dict:
    """โหลดเฉลยคำตอบประจำวิชาจาก Memory หรือไฟล์"""
    if subject_id in SAVED_ANSWER_KEYS:
        return SAVED_ANSWER_KEYS[subject_id]
    return SAVED_ANSWER_KEYS.get("default", {})


# แมปชื่อคลาสจาก YOLO เป็นตัวเลือก
CHOICE_MAP = {
    "valid1": "1",
    "valid2": "2",
    "valid3": "3",
    "valid4": "4",
    "valid5": "5",
    "invalid_malform": "รูปแบบไม่ถูกต้อง",
    "invalid_multiple": "หลายตัวเลือก",
    "invalid_blank": "ไม่มีตัวเลือก"
}

# คลาสที่เป็นมาร์กเกอร์จัดหน้า (ไม่นำมารวมเป็นข้อคำตอบ)
LAYOUT_CLASSES = {"start_corner", "column"}


def compute_box_iou(boxA, boxB):
    """คำนวณ Intersection over Union (IoU) ระหว่างกล่องคำตอบ 2 กล่อง"""
    xA = max(boxA["x1"], boxB["x1"])
    yA = max(boxA["y1"], boxB["y1"])
    xB = min(boxA["x2"], boxB["x2"])
    yB = min(boxA["y2"], boxB["y2"])

    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = abs((boxA["x2"] - boxA["x1"]) * (boxA["y2"] - boxA["y1"]))
    boxBArea = abs((boxB["x2"] - boxB["x1"]) * (boxB["y2"] - boxB["y1"]))

    if float(boxAArea + boxBArea - interArea) <= 0:
        return 0.0
    return interArea / float(boxAArea + boxBArea - interArea)


def remove_duplicate_detections(detections, iou_threshold=0.45):
    """ขจัดกล่องที่ซ้อนทับกันซ้ำซ้อนบนข้อเดียวกัน โดยเก็บกล่องที่มีค่า Confidence สูงกว่า"""
    if not detections:
        return []

    # เรียงลำดับจาก Confidence มากไปน้อย
    sorted_dets = sorted(detections, key=lambda d: d["confidence"], reverse=True)
    kept_dets = []

    for det in sorted_dets:
        box_a = det["box"]
        is_duplicate = False
        for kept in kept_dets:
            box_b = kept["box"]
            iou = compute_box_iou(box_a, box_b)
            if iou > iou_threshold:
                is_duplicate = True
                break
        if not is_duplicate:
            kept_dets.append(det)

    return kept_dets


def sort_omr_detections(detections):
    """
    จัดเรียงตำแหน่งกล่องคำตอบ OMR ตามพิกัด 2 มิติ (แนวตั้งและแนวนอน y1, x1):
    1. ขจัดกล่องซ้อนทับด้วย Non-Maximum Suppression (IoU)
    2. คำนวณจุดศูนย์กลาง cx, cy ของแต่ละกล่อง
    3. แบ่งกลุ่มกล่องตามคอลัมน์แนวตั้ง (X-clustering)
    4. เรียงคอลัมน์จากซ้ายไปขวา (X น้อยไปมาก)
    5. ในแต่ละคอลัมน์ เรียงคำตอบจากบนลงล่าง (Y น้อยไปมาก)
    """
    if not detections:
        return []

    # ขจัดกล่องซ้อนทับกันซ้ำซ้อน
    detections = remove_duplicate_detections(detections)

    # คำนวณ cx, cy, width สำหรับแต่ละ detection
    for det in detections:
        box = det["box"]
        det["cx"] = (box["x1"] + box["x2"]) / 2.0
        det["cy"] = (box["y1"] + box["y2"]) / 2.0
        det["width"] = abs(box["x2"] - box["x1"])

    # หาความกว้างเฉลี่ย เพื่อกำหนด Threshold สำหรับแบ่งคอลัมน์
    avg_width = sum(d["width"] for d in detections) / len(detections)
    col_threshold = max(avg_width * 0.75, 25.0)

    # เรียงลำดับตาม X ก่อนเพื่อแยกคอลัมน์
    sorted_by_x = sorted(detections, key=lambda d: d["cx"])

    columns = []
    current_col = []

    for det in sorted_by_x:
        if not current_col:
            current_col.append(det)
        else:
            col_avg_x = sum(d["cx"] for d in current_col) / len(current_col)
            if abs(det["cx"] - col_avg_x) <= col_threshold:
                current_col.append(det)
            else:
                columns.append(current_col)
                current_col = [det]

    if current_col:
        columns.append(current_col)

    # เรียงคอลัมน์จากซ้ายไปขวา (แกน X)
    columns.sort(key=lambda col: sum(d["cx"] for d in col) / len(col))

    # ในแต่ละคอลัมน์ เรียงจากบนลงล่าง (แกน Y: y1)
    sorted_detections = []
    for col in columns:
        col.sort(key=lambda d: (d["box"]["y1"], d["cx"]))
        sorted_detections.extend(col)

    # ลบฟิลด์คำนวณชั่วคราวออก
    for det in sorted_detections:
        det.pop("cx", None)
        det.pop("cy", None)
        det.pop("width", None)

    return sorted_detections


@app.get("/")
def home():
    return {
        "status": "success",
        "message": "OMR FastAPI Server is running",
        "model_classes": model.names,
        "saved_subjects": list(SAVED_ANSWER_KEYS.keys())
    }


@app.get("/health")
def health_check():
    """Endpoint สำหรับ Health Check ของ Render หรือ Cloud Hosting"""
    return {"status": "ok", "service": "omr-fastapi"}



@app.get("/get_answer_key")
@app.get("/get_answer_key/{subject_id}")
def get_saved_answer_key(subject_id: Optional[str] = "default"):
    """ดึงข้อมูลเฉลยที่บันทึกไว้สำหรับรายวิชา"""
    key = load_answer_key(subject_id)
    return {
        "status": "success",
        "subject_id": subject_id,
        "totalQuestions": len(key),
        "answerKey": key
    }


@app.post("/extract_answer_key")
async def extract_answer_key(file: UploadFile = File(None), image: UploadFile = File(None)):
    """สกัดเฉลยจากรูปภาพกระดาษคำตอบที่เป็นเฉลย (คัดแยกและจัดเรียงตามพิกัด 2D)"""
    target_file = file or image
    if not target_file:
        raise HTTPException(
            status_code=400,
            detail="ไม่พบไฟล์รูปภาพ (กรุณาส่งไฟล์ผ่าน Multipart form-data key 'file' หรือ 'image')"
        )

    file_ext = os.path.splitext(target_file.filename)[1] or ".jpg"
    filename = f"key_{uuid.uuid4()}{file_ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    try:
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(target_file.file, buffer)

        # ปรับหมุนทิศทางภาพอัตโนมัติตามค่า EXIF
        preprocess_image_orientation(filepath)

        # ใช้ conf=0.15 และ imgsz=800 เพื่อให้ตรวจจับกล่องคำตอบครบทุกข้อตามโมเดลเดิม
        results = model.predict(
            source=filepath,
            conf=0.15,
            imgsz=800,
            verbose=False
        )

        raw_detections = []
        for result in results:
            boxes = result.boxes
            for box in boxes:
                cls_id = int(box.cls[0])
                cls_name = model.names.get(cls_id, str(cls_id))
                conf = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxy[0].tolist()

                raw_detections.append({
                    "class_id": cls_id,
                    "class_name": cls_name,
                    "confidence": round(conf, 4),
                    "box": {
                        "x1": round(x1, 2),
                        "y1": round(y1, 2),
                        "x2": round(x2, 2),
                        "y2": round(y2, 2)
                    }
                })

        # กรองคลาสที่ไม่ใช่มาร์กเกอร์จัดหน้า
        answer_detections = [
            det for det in raw_detections
            if det["class_name"] not in LAYOUT_CLASSES
        ]

        # จัดเรียงคำตอบตามพิกัด 2D (ซ้ายไปขวา, บนลงล่าง)
        sorted_answers = sort_omr_detections(answer_detections)

        # หาข้อสุดท้ายที่มีการระบายเฉลยจริง (ไม่ใช่ข้อว่าง/invalid_blank)
        last_valid_idx = 0
        for i, det in enumerate(sorted_answers, start=1):
            cls_name = det["class_name"]
            choice = CHOICE_MAP.get(cls_name, cls_name)
            if cls_name.startswith("valid") or choice in ["1", "2", "3", "4", "5"]:
                last_valid_idx = i

        # ตัดข้อสอบส่วนท้ายที่เป็นข้อว่างออกเฉพาะกระดาษแผ่นใหญ่ (มากกว่า 30 ข้อ)
        # แต่หากตรวจพบไม่เกิน 30 ข้อ (เช่น กระดาษ 20-25 ข้อ) ให้คงไว้ครบทุกข้อที่ตรวจพบ
        if len(sorted_answers) > 30 and last_valid_idx > 0:
            sorted_answers = sorted_answers[:last_valid_idx]

        extracted_key = {}
        items = []

        for idx, det in enumerate(sorted_answers, start=1):
            class_name = det["class_name"]
            choice = CHOICE_MAP.get(class_name, class_name)
            str_idx = str(idx)

            # หากตรวจพบตัวเลือกชัดเจนให้ใช้ตัวเลือกนั้น หากตรวจจับไม่ชัดให้เว้นว่างไว้ให้ผู้ใช้เลือกเอง
            if class_name.startswith("valid") or choice in ["1", "2", "3", "4", "5"]:
                selected_val = choice
            else:
                selected_val = ""

            # บันทึกทุกข้อลงในเฉลยเรียงตั้งแต่ข้อ 1 ถึงข้อสุดท้าย
            extracted_key[str_idx] = selected_val

            items.append({
                "question": idx,
                "selected": selected_val,
                "rawClass": class_name,
                "confidence": det["confidence"],
                "box": det["box"]
            })

        # หากตรวจพบข้อสอบในกระดาษขนาด 25 ข้อ (เช่น 10 - 24 ข้อ) ให้เติมให้แสดงครบ 25 ข้อเสมอ
        # เพื่อให้เฉลยปรากฏครบทุกข้อ 1 ถึง 25 ให้ผู้ใช้ตรวจสอบ/แก้ไขได้อย่างครบถ้วน
        if 10 <= len(extracted_key) < 25:
            for q in range(1, 26):
                sq = str(q)
                if sq not in extracted_key:
                    extracted_key[sq] = ""
                    items.append({
                        "question": q,
                        "selected": "",
                        "rawClass": "invalid_blank",
                        "confidence": 0.0,
                        "box": None
                    })
            items.sort(key=lambda it: it["question"])

        return {
            "status": "success",
            "isAnswerKey": True,
            "totalQuestions": len(extracted_key),
            "answerKey": extracted_key,
            "items": items,
            "summary": f"ถอดเฉลยได้ทั้งหมด {len(extracted_key)} ข้อ"
        }


    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"เกิดข้อผิดพลาดในการถอดเฉลย: {str(e)}"
        )
    finally:
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
            except Exception:
                pass


@app.post("/save_answer_key")
async def save_answer_key_api(payload: dict):
    """บันทึกเฉลยคำตอบสำหรับรายวิชา"""
    subject_id = payload.get("subject_id") or payload.get("subjectId") or "default"
    answer_key = payload.get("answer_key") or payload.get("answerKey") or {}

    if not answer_key:
        raise HTTPException(status_code=400, detail="กรุณาระบุ answer_key")

    SAVED_ANSWER_KEYS[subject_id] = answer_key
    if subject_id == "default" or "default" not in SAVED_ANSWER_KEYS:
        SAVED_ANSWER_KEYS["default"] = answer_key

    save_all_answer_keys(SAVED_ANSWER_KEYS)

    return {
        "status": "success",
        "message": f"บันทึกเฉลย {len(answer_key)} ข้อสำหรับวิชา {subject_id} เรียบร้อยแล้ว",
        "totalQuestions": len(answer_key),
        "answerKey": answer_key
    }


@app.post("/predict")
async def predict(
    file: UploadFile = File(None),
    image: UploadFile = File(None),
    answer_key: Optional[str] = Form(None),
    subject_id: Optional[str] = Form(None)
):
    """ประมวลผลกระดาษคำตอบนักเรียน และเปรียบเทียบกับเฉลยประจำวิชาอย่างครบถ้วนทุกข้อ"""
    target_file = file or image
    if not target_file:
        raise HTTPException(
            status_code=400,
            detail="ไม่พบไฟล์รูปภาพ (กรุณาส่งไฟล์ผ่าน Multipart form-data key 'file' หรือ 'image')"
        )

    file_ext = os.path.splitext(target_file.filename)[1] or ".jpg"
    filename = f"{uuid.uuid4()}{file_ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    try:
        # บันทึกไฟล์รูปภาพชั่วคราว
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(target_file.file, buffer)

        # ปรับหมุนทิศทางภาพอัตโนมัติตามค่า EXIF
        preprocess_image_orientation(filepath)

        # ประมวลผลภาพผ่าน YOLO Model ด้วย conf=0.15 และ imgsz=800 เพื่อความแม่นยำตามโมเดลเดิม
        results = model.predict(
            source=filepath,
            conf=0.15,
            imgsz=800,
            verbose=False
        )

        raw_detections = []

        for result in results:
            boxes = result.boxes
            for box in boxes:
                cls_id = int(box.cls[0])
                cls_name = model.names.get(cls_id, str(cls_id))
                conf = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxy[0].tolist()

                raw_detections.append({
                    "class_id": cls_id,
                    "class_name": cls_name,
                    "confidence": round(conf, 4),
                    "box": {
                        "x1": round(x1, 2),
                        "y1": round(y1, 2),
                        "x2": round(x2, 2),
                        "y2": round(y2, 2)
                    }
                })

        # กรองเฉพาะกล่องที่เป็นข้อคำตอบ
        answer_detections = [
            det for det in raw_detections
            if det["class_name"] not in LAYOUT_CLASSES
        ]

        # เรียงลำดับคำตอบตามพิกัด 2D
        sorted_answers = sort_omr_detections(answer_detections)

        # กำหนดเฉลยที่จะใช้เปรียบเทียบ
        active_answer_key = {}
        if answer_key:
            try:
                active_answer_key = json.loads(answer_key)
            except Exception:
                active_answer_key = {}

        if not active_answer_key and subject_id and subject_id in SAVED_ANSWER_KEYS:
            active_answer_key = SAVED_ANSWER_KEYS[subject_id]

        if not active_answer_key and subject_id:
            active_answer_key = load_answer_key(subject_id)

        if not active_answer_key:
            active_answer_key = load_answer_key("default")

        # คำนวณขอบเขตจำนวนข้อสอบจากเฉลย
        key_question_indices = []
        for k in active_answer_key.keys():
            try:
                key_question_indices.append(int(k))
            except ValueError:
                pass

        max_key_q = max(key_question_indices) if key_question_indices else 0

        if max_key_q > 0:
            # เริ่มต้นขอบเขตข้อสอบตามข้อสุดท้ายที่มีในเฉลย (เช่น 25 ข้อ)
            target_limit = max_key_q

            # ตรวจสอบ 5 ข้อถัดไป (เช่น ข้อ 26 ถึง 30) ว่านักเรียนมีการระบายคำตอบเพิ่มหรือไม่
            lookahead_limit = min(len(sorted_answers), max_key_q + 5)
            for idx in range(max_key_q + 1, lookahead_limit + 1):
                det = sorted_answers[idx - 1]
                cls_n = det["class_name"]
                ch = CHOICE_MAP.get(cls_n, cls_n)
                # หากมีการระบายตัวเลือกในข้อถัดไป (ที่ไม่ใช่ว่างเปล่า/invalid_blank)
                if cls_n.startswith("valid") or cls_n in ["1", "2", "3", "4", "5"] or ch in ["1", "2", "3", "4", "5"]:
                    target_limit = idx  # ขยายขอบเขตถึงข้อที่มีการระบาย

            total_target_questions = target_limit
        else:
            total_target_questions = len(sorted_answers)

        answers = []
        score = 0

        for idx in range(1, total_target_questions + 1):
            str_idx = str(idx)
            expected_choice = str(active_answer_key[str_idx]) if str_idx in active_answer_key else None

            if idx <= len(sorted_answers):
                det = sorted_answers[idx - 1]
                class_name = det["class_name"]
                selected_choice = CHOICE_MAP.get(class_name, class_name)
                confidence = det["confidence"]
                box = det["box"]
            else:
                # กรณีตรวจไม่พบคำตอบในข้อนี้ (ขาดคำตอบ)
                class_name = "invalid_blank"
                selected_choice = CHOICE_MAP.get("invalid_blank", "ไม่มีตัวเลือก")
                confidence = 0.0
                box = None

            if expected_choice is not None:
                is_correct = (
                    selected_choice == expected_choice
                    or class_name == expected_choice
                    or (class_name in CHOICE_MAP and CHOICE_MAP[class_name] == expected_choice)
                    or (class_name == "invalid_malform" and expected_choice in ["รูปแบบไม่ถูกต้อง"])
                    or (class_name == "invalid_multiple" and expected_choice in ["หลายตัวเลือก"])
                    or (class_name == "invalid_blank" and expected_choice in ["-", "ไม่มีตัวเลือก"])
                )
            else:
                is_correct = class_name.startswith("valid")

            status_str = "correct" if is_correct else "incorrect"
            if is_correct:
                score += 1

            answers.append({
                "question": idx,
                "selected": selected_choice,
                "expected": expected_choice or "-",
                "rawClass": class_name,
                "status": status_str,
                "confidence": confidence,
                "box": box
            })

        total_questions = len(answers)
        max_score = len(active_answer_key) if len(active_answer_key) > 0 else total_questions

        summary_msg = f"ตรวจพบคำตอบทั้งหมด {total_questions} ข้อ"
        if max_score > 0:
            summary_msg += f" (คะแนนที่ได้ {score}/{max_score})"

        return {
            "status": "success",
            "totalQuestions": total_questions,
            "score": score,
            "maxScore": max_score,
            "summary": summary_msg,
            "answers": answers,
            "detections": raw_detections,
            "answerKeyUsed": active_answer_key
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"เกิดข้อผิดพลาดในการประมวลผลรูปภาพ: {str(e)}"
        )
    finally:
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
            except Exception:
                pass


if __name__ == "__main__":
    import uvicorn
    # ดึงค่า PORT จาก Environment Variable ของ Render (ถ้าไม่มีให้ใช้ 8000 เป็นค่าเริ่มต้น)
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)