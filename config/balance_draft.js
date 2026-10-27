/* =====================================================================
   WW3 THAILAND SURVIVAL — BALANCE DRAFT (ร่าง รออนุมัติ)
   -----------------------------------------------------------------
   ทุกค่าในไฟล์นี้ Claude ร่างขึ้นตามที่ผู้กำกับสั่ง ("ให้ผมร่าง แล้วคุณตรวจ")
   ยังไม่ใช่ค่าที่อนุมัติ  แก้ตัวเลขในไฟล์นี้ได้โดยตรง ไม่ต้องแตะโค้ดเกม
   status: DRAFT_NOT_APPROVED
   ===================================================================== */
window.WW3_BALANCE = {
  status: "DRAFT_NOT_APPROVED",
  version: "draft-1 (2026-10-27)",

  /* สถานะหลัก 7 ค่า (ตามเอกสาร Vision ข้อ 5) ช่วง 0–100 */
  stats: [
    { key: "health",    th: "สุขภาพ",       icon: "❤️" },
    { key: "fullness",  th: "ความอิ่ม",      icon: "🍚" },
    { key: "hydration", th: "น้ำในร่างกาย",  icon: "💧" },
    { key: "energy",    th: "พลังงาน",      icon: "⚡" },
    { key: "mental",    th: "สภาพจิตใจ",    icon: "🙂" },
    { key: "safety",    th: "ความปลอดภัย",  icon: "🛡️" },
    { key: "clean",     th: "ความสะอาด",    icon: "🧼" }
  ],

  /* ค่าเริ่มต้นก่อนปรับตามภูมิหลัง [ร่าง] */
  startStats: { health: 85, fullness: 75, hydration: 75, energy: 80, mental: 70, safety: 65, clean: 70 },

  /* การเปลี่ยนแปลงท้ายวัน (กิน-ดื่ม-ใช้ชีวิตตามปกติ, นอน) [ร่าง] */
  /* ผู้กำกับอนุมัติ 27 ต.ค. (รอบ 2): ลดเหลือวันละ 2 เหตุการณ์ จึงลดค่าที่ลดต่อวันเหลือ 70% ของเดิม (เดิม อิ่ม −4.5 น้ำ −4.5 จิตใจ −6 ปลอดภัย −4.5 สะอาด −4) · ทศนิยม = สุ่มปัดเศษ ค่าเฉลี่ยตรง */
  dailyChange: { fullness: -3.15, hydration: -3.15, energy: 0 /* พลังงานฟื้นจากการนอนตอนกลางคืนแทน (27 ต.ค. รอบ 3) */, mental: -4.2, safety: -3.15, clean: -2.8 },

  /* กฎสุขภาพท้ายวัน [ร่าง] — สุขภาพลดเมื่อค่าอื่นต่ำ ฟื้นเมื่อพื้นฐานดี */
  healthRules: {
    lowThreshold: 20,
    penalties: { fullness: -8, hydration: -8, clean: -8, mental: -8, energy: -3 } /* ผู้กำกับอนุมัติ 27 ต.ค. */,
    recover: { ifAllAtLeast: { fullness: 40, hydration: 40, clean: 30 }, amount: +3 }
  },

  /* ความยากตามความยาวเกม (ผู้กำกับกำหนด 27 ต.ค.): เริ่มวันที่ 60, +20% ทุก 30 วัน (วันที่ 90 = x1.2, วันที่ 360 = x3.0), ไม่มีเพดาน
     ใช้กับค่าที่ลดต่อวัน (อิ่ม น้ำ จิตใจ ปลอดภัย สะอาด) และโอกาสเกิดอุบัติเหตุ */
  difficulty: { startDay: 60, everyDays: 30, stepPct: 20, cap: null },

  /* อุบัติเหตุ (ผู้กำกับกำหนด 27 ต.ค.): ปกติ ~เดือนละครั้ง, พลังงาน/ความปลอดภัย < 30 อย่างละ x2, บาดเจ็บสุ่ม 5–15, ไม่ตายทันทีแต่ตายได้ถ้าสุขภาพหมด */
  accident: { baseChancePerDay: 1 / 30, lowBelow: 30, lowStats: ["energy", "safety"], lowMultiplier: 2, injuryMin: 5, injuryMax: 15 },

  /* ข้อความสาเหตุการตาย (ผู้กำกับอนุมัติแนวคิด 27 ต.ค.) — key = ค่าสถานะที่ทำให้สุขภาพลดมากที่สุดใน 7 วันสุดท้าย */
  deathCauses: {
    fullness: "อดอาหารจนร่างกายทรุด",
    hydration: "ขาดน้ำ",
    clean: "ติดเชื้อและล้มป่วย",
    mental: "หมดกำลังใจจนร่างกายทรุดและล้มป่วย",
    energy: "อ่อนเพลียจนร่างกายรับไม่ไหว",
    accident: "บาดเจ็บจากอุบัติเหตุ",
    other: "สุขภาพทรุดลงเรื่อย ๆ"
  },

  /* เงื่อนไขแพ้ [ร่าง]: สุขภาพเป็น 0 เท่านั้น (ค่าอื่นเป็น 0 จะทำให้สุขภาพลดตามกฎด้านบน) */
  defeat: { stat: "health", atOrBelow: 0 },
  warnAt: 25,

  /* โครงสร้างวัน (เอกสาร ข้อ 4: 3 เหตุการณ์/วัน ช่วงเวลาสุ่ม) */
  day: {
    eventsPerDay: 2,                    // ผู้กำกับอนุมัติ 27 ต.ค.: เกม 4 บท 100 วัน วันละ 2 เหตุการณ์
    hourMin: 6, hourMax: 23,            // ช่วงเวลาที่สุ่มเหตุการณ์ [ร่าง]
    minGapHours: 2
  },

  /* กฎเลือกเหตุการณ์ [ร่าง — ไม่มีสเปกในไฟล์ต้นฉบับ]
     - เหตุการณ์ในแต่ละกลุ่มเล่นตามลำดับ R ภายในกลุ่ม
     - หนึ่งวันไม่ซ้ำกลุ่ม
     - น้ำหนักสุ่ม: กลุ่มที่สถานะหลักของกลุ่มนั้นต่ำ จะมีโอกาสเกิดมากขึ้น (ให้ผู้เล่นมีโอกาสรับมือ)
     - กลุ่ม "การฟื้นตัว" ปลดล็อกหลังวันที่กำหนด
     - เล่นครบ 10 เหตุการณ์ในกลุ่มแล้ว: พักกลุ่มนั้นตาม cooldown แล้ววนกลับเหตุการณ์แรก
       (วิธีวนนี้เป็นร่าง เอกสารห้ามสมมติวิธีวน — รอผู้กำกับอนุมัติหรือแก้) */
  schedule: {
    baseWeight: 1,
    needWeight: 2.5,            // น้ำหนักเพิ่ม = needWeight × (1 - ค่าสถานะหลัก/100)
    lockedUntilDay: { "การฟื้นตัว": 21 },
    loopAfterArcComplete: true,
    arcCooldownDays: 15
  },

  /* สถานะหลักของแต่ละกลุ่ม (ใช้กับน้ำหนักสุ่ม และเป็นฐานของผลตัวเลือก) [ร่าง] */
  arcPrimary: {
    "น้ำสะอาด": "hydration",
    "อาหาร": "fullness",
    "ที่พัก": "clean",
    "เวชภัณฑ์": "health",
    "ครอบครัว": "mental",
    "ข่าวสาร": "safety",
    "ไฟฟ้า": "mental",
    "การเดินทาง": "safety",
    "ชุมชน": "clean",
    "การแลกเปลี่ยน": "hydration",
    "สุขภาพจิต": "mental",
    "สภาพอากาศ": "hydration",
    "การศึกษา": "mental",
    "เกษตร": "fullness",
    "สัตว์เลี้ยง": "clean",
    "ความปลอดภัย": "safety",
    "การปกครอง": "safety",
    "งานและทักษะ": "fullness",
    "ผู้ย้ายถิ่น": "safety",
    "การฟื้นตัว": "health"
  },

  /* ผลของตัวเลือก A–D ต่อสถานะ [ร่าง]
     ข้อมูลต้นฉบับ: ตัวเลือก 4 แบบใช้ข้อความเดียวกันทั้ง 10 เหตุการณ์ในกลุ่ม → ร่างผลเป็นรายกลุ่ม × ตัวเลือก (80 ชุด)
     แนวคิดร่าง: A=แบ่ง/ช่วยผู้อื่น  B=เก็บไว้/ดูแลตนเอง  C=ตรวจสอบก่อน  D=จัดระบบร่วมกับชุมชน
     overrides: ใส่ผลเฉพาะรายเหตุการณ์ได้ เช่น "R001": { A: { hydration: -5, mental: 8 } } */
  /* ผลตัวเลือก (ผู้กำกับอนุมัติแนวทาง 27 ต.ค. รอบ 3 · แนว This War of Mine: ทุกตัวเลือกมีราคา)
     A ช่วยเหลือ: จิตใจ +7 ปลอดภัย +3 แต่เสียค่าหลักของหมวด −2 (หรืออิ่ม −2) พลังงาน −4
     B เก็บไว้เอง: ค่าหลัก +10 ค่ารอง +2 แต่จิตใจ −3 ปลอดภัย −2 พลังงาน −2
     C ตรวจสอบ: ค่าหลัก +5 ค่ารอง +1 พลังงาน −3 (ใช้แรงน้อย)
     D ประสานงาน: ค่าหลัก +8 ค่ารอง +2 จิตใจ +2 แต่พลังงาน −8 (เหนื่อยมาก)
     ค่ารองต่อหมวด: ไฟฟ้า=fullness, การแลกเปลี่ยน=fullness, เกษตร=hydration, งานและทักษะ=hydration, การปกครอง=fullness, น้ำสะอาด=clean, สภาพอากาศ=clean, ที่พัก=safety, ชุมชน=safety, อาหาร=health
     ตัวเลขเดิมก่อนรอบนี้ดูได้ใน git history */
  choiceEffects: {
    "น้ำสะอาด": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "hydration": -2
      },
      "B": {
        "hydration": 10,
        "clean": 2,
        "mental": -3,
        "safety": -2,
        "energy": -2
      },
      "C": {
        "hydration": 5,
        "clean": 1,
        "energy": -3
      },
      "D": {
        "hydration": 8,
        "clean": 2,
        "mental": 2,
        "energy": -8
      }
    },
    "อาหาร": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "fullness": -2
      },
      "B": {
        "fullness": 10,
        "health": 2,
        "mental": -3,
        "safety": -2,
        "energy": -2
      },
      "C": {
        "fullness": 5,
        "health": 1,
        "energy": -3
      },
      "D": {
        "fullness": 8,
        "health": 2,
        "mental": 2,
        "energy": -8
      }
    },
    "ที่พัก": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "clean": -2
      },
      "B": {
        "clean": 10,
        "safety": 0,
        "mental": -3,
        "energy": -2
      },
      "C": {
        "clean": 5,
        "safety": 1,
        "energy": -3
      },
      "D": {
        "clean": 8,
        "safety": 2,
        "mental": 2,
        "energy": -8
      }
    },
    "เวชภัณฑ์": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "fullness": -2
      },
      "B": {
        "health": 10,
        "mental": -3,
        "safety": -2,
        "energy": -2
      },
      "C": {
        "health": 5,
        "energy": -3
      },
      "D": {
        "health": 8,
        "mental": 2,
        "energy": -8
      }
    },
    "ครอบครัว": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "fullness": -2
      },
      "B": {
        "mental": 10,
        "safety": -5,
        "energy": -2
      },
      "C": {
        "mental": 5,
        "energy": -3
      },
      "D": {
        "mental": 8,
        "energy": -8
      }
    },
    "ข่าวสาร": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "fullness": -2
      },
      "B": {
        "safety": 10,
        "mental": -5,
        "energy": -2
      },
      "C": {
        "safety": 5,
        "energy": -3
      },
      "D": {
        "safety": 8,
        "mental": 2,
        "energy": -8
      }
    },
    "ไฟฟ้า": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "fullness": -2
      },
      "B": {
        "mental": 10,
        "fullness": 2,
        "safety": -5,
        "energy": -2
      },
      "C": {
        "mental": 5,
        "fullness": 1,
        "energy": -3
      },
      "D": {
        "mental": 8,
        "fullness": 2,
        "energy": -8
      }
    },
    "การเดินทาง": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "fullness": -2
      },
      "B": {
        "safety": 10,
        "mental": -5,
        "energy": -2
      },
      "C": {
        "safety": 5,
        "energy": -3
      },
      "D": {
        "safety": 8,
        "mental": 2,
        "energy": -8
      }
    },
    "ชุมชน": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "clean": -2
      },
      "B": {
        "clean": 10,
        "safety": 0,
        "mental": -3,
        "energy": -2
      },
      "C": {
        "clean": 5,
        "safety": 1,
        "energy": -3
      },
      "D": {
        "clean": 8,
        "safety": 2,
        "mental": 2,
        "energy": -8
      }
    },
    "การแลกเปลี่ยน": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "hydration": -2
      },
      "B": {
        "hydration": 10,
        "fullness": 2,
        "mental": -3,
        "safety": -2,
        "energy": -2
      },
      "C": {
        "hydration": 5,
        "fullness": 1,
        "energy": -3
      },
      "D": {
        "hydration": 8,
        "fullness": 2,
        "mental": 2,
        "energy": -8
      }
    },
    "สุขภาพจิต": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "fullness": -2
      },
      "B": {
        "mental": 10,
        "safety": -5,
        "energy": -2
      },
      "C": {
        "mental": 5,
        "energy": -3
      },
      "D": {
        "mental": 8,
        "energy": -8
      }
    },
    "สภาพอากาศ": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "hydration": -2
      },
      "B": {
        "hydration": 10,
        "clean": 2,
        "mental": -3,
        "safety": -2,
        "energy": -2
      },
      "C": {
        "hydration": 5,
        "clean": 1,
        "energy": -3
      },
      "D": {
        "hydration": 8,
        "clean": 2,
        "mental": 2,
        "energy": -8
      }
    },
    "การศึกษา": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "fullness": -2
      },
      "B": {
        "mental": 10,
        "safety": -5,
        "energy": -2
      },
      "C": {
        "mental": 5,
        "energy": -3
      },
      "D": {
        "mental": 8,
        "energy": -8
      }
    },
    "เกษตร": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "fullness": -2
      },
      "B": {
        "fullness": 10,
        "hydration": 2,
        "mental": -3,
        "safety": -2,
        "energy": -2
      },
      "C": {
        "fullness": 5,
        "hydration": 1,
        "energy": -3
      },
      "D": {
        "fullness": 8,
        "hydration": 2,
        "mental": 2,
        "energy": -8
      }
    },
    "สัตว์เลี้ยง": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "clean": -2
      },
      "B": {
        "clean": 10,
        "mental": -3,
        "safety": -2,
        "energy": -2
      },
      "C": {
        "clean": 5,
        "energy": -3
      },
      "D": {
        "clean": 8,
        "mental": 2,
        "energy": -8
      }
    },
    "ความปลอดภัย": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "fullness": -2
      },
      "B": {
        "safety": 10,
        "mental": -5,
        "energy": -2
      },
      "C": {
        "safety": 5,
        "energy": -3
      },
      "D": {
        "safety": 8,
        "mental": 2,
        "energy": -8
      }
    },
    "การปกครอง": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "fullness": -2
      },
      "B": {
        "safety": 10,
        "fullness": 2,
        "mental": -5,
        "energy": -2
      },
      "C": {
        "safety": 5,
        "fullness": 1,
        "energy": -3
      },
      "D": {
        "safety": 8,
        "fullness": 2,
        "mental": 2,
        "energy": -8
      }
    },
    "งานและทักษะ": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "fullness": -2
      },
      "B": {
        "fullness": 10,
        "hydration": 2,
        "mental": -3,
        "safety": -2,
        "energy": -2
      },
      "C": {
        "fullness": 5,
        "hydration": 1,
        "energy": -3
      },
      "D": {
        "fullness": 8,
        "hydration": 2,
        "mental": 2,
        "energy": -8
      }
    },
    "ผู้ย้ายถิ่น": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "fullness": -2
      },
      "B": {
        "safety": 10,
        "mental": -5,
        "energy": -2
      },
      "C": {
        "safety": 5,
        "energy": -3
      },
      "D": {
        "safety": 8,
        "mental": 2,
        "energy": -8
      }
    },
    "การฟื้นตัว": {
      "A": {
        "mental": 7,
        "safety": 3,
        "energy": -4,
        "fullness": -2
      },
      "B": {
        "health": 10,
        "mental": -3,
        "safety": -2,
        "energy": -2
      },
      "C": {
        "health": 5,
        "energy": -3
      },
      "D": {
        "health": 8,
        "mental": 2,
        "energy": -8
      }
    }
  },

  choiceOverrides: {},

  /* ตารางสุ่มตัวละคร [ร่าง — ยกเว้นรายชื่อ 77 จังหวัดซึ่งเป็นข้อเท็จจริง] */
  character: {
    ageMin: 18, ageMax: 68,
    sexes: ["ชาย", "หญิง"],
    namesM: ["สมชาย","ธนพล","วีระ","ณัฐวุฒิ","อนุชา","กิตติ","ประเสริฐ","ภานุ","ชัยวัฒน์","สุรเชษฐ์"],
    namesF: ["สุภาพร","วรรณา","กมลชนก","ปิยะนุช","ศิริพร","นภา","อรุณี","ธิดารัตน์","มาลัย","จันทร์เพ็ญ"],
    /* tier: poor / middle / wealthy → เลือกฉากบ้าน BG01-A / B / C [ร่างการจับคู่ จากลักษณะภาพ] */
    occupations: [
      { th: "เกษตรกร", tier: "poor" }, { th: "รับจ้างทั่วไป", tier: "poor" },
      { th: "แม่ค้า/พ่อค้ารายย่อย", tier: "poor" }, { th: "คนขับรถรับจ้าง", tier: "poor" },
      { th: "พนักงานโรงงาน", tier: "poor" }, { th: "นักศึกษา", tier: "poor", ageMax: 25 },
      { th: "พนักงานร้านค้า", tier: "middle" }, { th: "พนักงานออฟฟิศ", tier: "middle" },
      { th: "ครู", tier: "middle" }, { th: "พยาบาล", tier: "middle" },
      { th: "ช่างเทคนิค", tier: "middle" }, { th: "ข้าราชการ", tier: "middle" },
      { th: "เจ้าของกิจการ", tier: "wealthy" }, { th: "วิศวกร", tier: "wealthy" }
    ],
    tiers: {
      poor:    { th: "รายได้น้อย",  bg: "BG01-A", mod: { fullness: -10, safety: -10, clean: -5 } },
      middle:  { th: "รายได้ปานกลาง", bg: "BG01-B", mod: {} },
      wealthy: { th: "รายได้สูง",   bg: "BG01-C", mod: { fullness: +10, safety: +10, clean: +5 } }
    },
    /* household: มีคนอื่นอยู่ในบ้าน · children: มีเด็กในบ้าน [ร่าง] */
    families: [
      { th: "อยู่คนเดียว",        mod: { mental: -5 },                                   household: false, children: false },
      { th: "อยู่กับคู่ครอง",      mod: { mental: +5 },                                   household: true,  children: false },
      { th: "มีลูกเล็ก",          mod: { mental: +5, fullness: -5 },                     household: true,  children: true },
      { th: "ดูแลพ่อแม่สูงอายุ",   mod: { energy: -5, mental: +3 },                       household: true,  children: false },
      { th: "ครอบครัวใหญ่",       mod: { fullness: -5, hydration: -5, safety: +5, mental: +5 }, household: true, children: true }
    ],
    /* สัตว์เลี้ยง [ผู้กำกับกำหนด 27 ต.ค.: มีสัตว์เลี้ยงรวม 45%, แมวมากกว่าสุนัข (สัดส่วนแมว:สุนัข 3:2 คงจากค่าก่อนหน้า)] w = เปอร์เซ็นต์ */
    pets: [
      { key: "none", th: "ไม่มีสัตว์เลี้ยง", w: 55 },
      { key: "dog",  th: "เลี้ยงสุนัข",      w: 18 },
      { key: "cat",  th: "เลี้ยงแมว",        w: 27 }
    ],
    /* ภาพสัตว์เลี้ยง (ผู้กำกับส่งมา 27 ต.ค.) — สุ่ม 1 ตัวต่อชีวิต โอกาสเท่ากัน; s = ขนาดเทียบตัวใหญ่สุดในชนิดเดียวกัน (จากแผ่นต้นฉบับ)
       h = ความสูงในฉากเทียบความสูงตัวละครผู้เล่น [ร่าง — ปรับได้] */
    petSprites: { size: { dog: 0.42, cat: 0.30 }, dog: [{"id": "dog_01", "s": 0.89}, {"id": "dog_02", "s": 1.0}, {"id": "dog_03", "s": 0.92}, {"id": "dog_04", "s": 0.76}, {"id": "dog_05", "s": 0.99}, {"id": "dog_06", "s": 0.74}, {"id": "dog_07", "s": 0.71}, {"id": "dog_08", "s": 0.82}, {"id": "dog_09", "s": 0.74}, {"id": "dog_10", "s": 0.86}], cat: [{"id": "cat_01", "s": 0.87}, {"id": "cat_02", "s": 0.88}, {"id": "cat_03", "s": 1.0}, {"id": "cat_04", "s": 0.94}, {"id": "cat_05", "s": 0.83}, {"id": "cat_06", "s": 0.96}, {"id": "cat_07", "s": 0.89}, {"id": "cat_08", "s": 0.91}, {"id": "cat_09", "s": 0.9}, {"id": "cat_10", "s": 0.78}] },
    healthBackgrounds: [
      { th: "สุขภาพแข็งแรง",   mod: { health: +5, energy: +5 } },
      { th: "สุขภาพปกติ",      mod: {} },
      { th: "มีโรคประจำตัว",   mod: { health: -15 } },
      { th: "ภูมิแพ้ฝุ่น",      mod: { health: -5, clean: -5 } }
    ],
    provinces: ["กรุงเทพมหานคร","กระบี่","กาญจนบุรี","กาฬสินธุ์","กำแพงเพชร","ขอนแก่น","จันทบุรี","ฉะเชิงเทรา","ชลบุรี","ชัยนาท","ชัยภูมิ","ชุมพร","เชียงราย","เชียงใหม่","ตรัง","ตราด","ตาก","นครนายก","นครปฐม","นครพนม","นครราชสีมา","นครศรีธรรมราช","นครสวรรค์","นนทบุรี","นราธิวาส","น่าน","บึงกาฬ","บุรีรัมย์","ปทุมธานี","ประจวบคีรีขันธ์","ปราจีนบุรี","ปัตตานี","พระนครศรีอยุธยา","พะเยา","พังงา","พัทลุง","พิจิตร","พิษณุโลก","เพชรบุรี","เพชรบูรณ์","แพร่","ภูเก็ต","มหาสารคาม","มุกดาหาร","แม่ฮ่องสอน","ยโสธร","ยะลา","ร้อยเอ็ด","ระนอง","ระยอง","ราชบุรี","ลพบุรี","ลำปาง","ลำพูน","เลย","ศรีสะเกษ","สกลนคร","สงขลา","สตูล","สมุทรปราการ","สมุทรสงคราม","สมุทรสาคร","สระแก้ว","สระบุรี","สิงห์บุรี","สุโขทัย","สุพรรณบุรี","สุราษฎร์ธานี","สุรินทร์","หนองคาย","หนองบัวลำภู","อ่างทอง","อำนาจเจริญ","อุดรธานี","อุตรดิตถ์","อุทัยธานี","อุบลราชธานี"],
    /* กันการสุ่มที่แพ้ทันที (เอกสาร ข้อ 3): ทุกค่าเริ่มไม่ต่ำกว่านี้ */
    minStartStat: 45
  },

  /* เงื่อนไขเหตุการณ์ตามชีวิตตัวละคร [ร่าง]
     household = ต้องมีคนอื่นในบ้าน · children = ต้องมีเด็กในบ้าน · pet = ต้องมีสัตว์เลี้ยง · dog / cat = ต้องเลี้ยงชนิดนั้น
     เหตุการณ์ที่ไม่ผ่านเงื่อนไขจะถูกข้าม (ไม่ใช่ถูกลบ) */
  eventRequires: {
    "R002": ["household"], "R023": ["household"], "R031": ["household"], "R032": ["household"],
    "R041": ["household"], "R042": ["children"], "R043": ["household"], "R044": ["household"], "R045": ["household"],
    "R046": ["household"], "R047": ["household"], "R048": ["children"], "R049": ["household"], "R050": ["household"],
    "R101": ["household"], "R102": ["children"], "R103": ["household"], "R105": ["household"], "R106": ["household"],
    "R113": ["household"], "R163": ["household"],
    "R141": ["dog"], "R142": ["pet"], "R143": ["cat"], "R146": ["dog"], "R147": ["pet"], "R148": ["children"]
  },

  /* การเดินทางข้ามจังหวัด — ผู้เล่นเลือกเอง ไม่บังคับ (เอกสาร ข้อ 2.1) [ร่างต้นทุน] */
  /* ช่วงกลางคืน (ผู้กำกับอนุมัติ 27 ต.ค. รอบ 3 · แนว This War of Mine) — หลังสรุปวัน เลือก 1 อย่าง
     ออกค้นหา: เลือกสถานที่ ยิ่งไกลยิ่งได้มากแต่เสี่ยงบาดเจ็บ (risk = โอกาสบาดเจ็บ × ความยากตามวัน, บาดเจ็บแล้วได้ของครึ่งเดียว)
     เฝ้าบ้าน: ปลอดภัยขึ้น และไม่โดนปล้น · นอนพัก: พลังงานฟื้น
     ถูกปล้น: ถ้าไม่ได้เฝ้าบ้าน และความปลอดภัยต่ำ */
  night: {
    defaultKey: "sleep",
    actions: [
      { key: "scavenge", th: "ออกค้นหา", places: [
        { id: "near", th: "บ้านร้างในซอย", effects: { fullness: 6, hydration: 6, clean: 2, energy: -8 }, risk: 0.03 },
        { id: "market", th: "ตลาดที่ถูกทิ้ง", effects: { fullness: 11, hydration: 10, clean: 4, energy: -12, safety: -2 }, risk: 0.10 },
        { id: "depot", th: "โกดังริมถนนใหญ่", effects: { fullness: 17, hydration: 15, clean: 6, energy: -16, safety: -4 }, risk: 0.20, injuryMin: 8, injuryMax: 20 }
      ] },
      { key: "guard", th: "เฝ้าบ้าน", effects: { safety: 8, energy: 4 } },
      { key: "sleep", th: "นอนพัก", effects: { energy: 18, mental: 3 } }
    ],
    raid: { chance: [{ below: 30, p: 0.25 }, { below: 50, p: 0.08 }], loss: { fullness: -8, hydration: -8, mental: -4 } }
  },

  travel: {
    enabled: true,
    cost: { energy: -25, safety: -10, fullness: -5, hydration: -8, mental: -3 },
    minEnergy: 30
  },

  /* Story Memory [ร่าง]: แสดงการตัดสินใจครั้งก่อนในกลุ่มเดียวกันเมื่อเหตุการณ์ใหม่ของกลุ่มนั้นเกิดขึ้น
     conditionRules ว่างไว้: เงื่อนไขในบทต้นฉบับยังเป็นหมายเหตุภาษาคน ต้องแปลงเป็นกฎหลังอนุมัติ
     รูปแบบกฎ: { event: "R004", ifChoice: { event: "R001", key: "A" }, note: "...", effects: {...}, variantText: "..." } */
  memory: { showPreviousInArc: true, conditionRules: [] }
};
