// Public code definitions only. No user data, tokens, or claimed run history.
export const PROCESS_REGISTRY = [
  {
    "id": "morning-brief",
    "title": "בריף בוקר",
    "category": "content",
    "version": "1",
    "files": [
      "docs/MORNING_BRIEF_PUBLISHING.md",
      "apps/terminal/public/terminal-brief.js",
      "scripts/validate_morning_brief.py"
    ],
    "flow": [
      "מחקר חיצוני",
      "תוצר סופי",
      "מהדורה מתוארכת וגרפים",
      "בדיקת חוזה ו־SHA256",
      "קורא הבריף"
    ],
    "sources": [
      "המחולל החיצוני לא מחובר",
      "מהדורה ציבורית סופית בלבד; ללא תיבות דואר או קבצים פרטיים"
    ],
    "coverage": "not_connected",
    "editing": "draft_only",
    "schedule": "לא נמצא מתזמן מחקר במאגר",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "מחקר חיצוני\nתוצר סופי\nמהדורה מתוארכת וגרפים\nבדיקת חוזה ו־SHA256\nקורא הבריף",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    }
  },
  {
    "id": "terminal:welcome",
    "title": "בית",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal.js"
    ],
    "flow": [
      "סיכום ניווט למודולים הקיימים"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "סיכום ניווט למודולים הקיימים",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "welcome"
  },
  {
    "id": "terminal:risk",
    "title": "מד סיכון",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-risk.js"
    ],
    "flow": [
      "אותות שוק",
      "ניקוד אותות",
      "ציון משוקלל"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "אותות שוק\nניקוד אותות\nציון משוקלל",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "risk"
  },
  {
    "id": "terminal:macro",
    "title": "מאקרו",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-macro.js"
    ],
    "flow": [
      "סדרות מאקרו",
      "תצפיות לפי תאריך",
      "תצוגה"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "סדרות מאקרו\nתצפיות לפי תאריך\nתצוגה",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "macro"
  },
  {
    "id": "terminal:fx",
    "title": "מטבעות",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal_app.html"
    ],
    "flow": [
      "עמוד מציין מקום קיים באתר; טרם נמצא מנגנון פעיל"
    ],
    "sources": [
      "לא מחובר: העמוד מסומן Coming soon"
    ],
    "coverage": "not_connected",
    "editing": "draft_only",
    "schedule": "לא נמצא מנגנון פעיל",
    "dependencies": [],
    "runtime_notes": "מציין מקום בלבד. אפשר לנסח טיוטת תכנון; אין תהליך פעיל לעריכה.",
    "draft_defaults": {
      "rules": "תכנון תהליך עתידי בלבד; העמוד הקיים הוא מציין מקום.",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "fx"
  },
  {
    "id": "terminal:rates",
    "title": "ריביות ותשואות",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-rates.js"
    ],
    "flow": [
      "תשואות לפי טווח",
      "עקום ומרווחים",
      "תצוגה"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "תשואות לפי טווח\nעקום ומרווחים\nתצוגה",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "rates"
  },
  {
    "id": "terminal:commodities",
    "title": "סחורות",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-metals.js",
      "services/api/data_engine/collectors.py",
      "services/api/data_engine/calculations.py",
      "apps/terminal/public/terminal-gold-expectations.js"
    ],
    "flow": [
      "מחירי חוזים וסדרות",
      "יחסי מתכות וציפיות",
      "גרפים"
    ],
    "sources": [
      "Yahoo Finance: חוזים רציפים דרך yfinance",
      "מתודולוגיית ציפיות זהב במודול; אין טרייס לכל מקור עדיין"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "מחירי חוזים וסדרות\nיחסי מתכות וציפיות\nגרפים",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "commodities"
  },
  {
    "id": "terminal:hormuz",
    "title": "סיכון הורמוז",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-hormuz.js"
    ],
    "flow": [
      "חדשות ונתוני שוק",
      "סיכום סיכון",
      "תצוגה"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "חדשות ונתוני שוק\nסיכום סיכון\nתצוגה",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "hormuz"
  },
  {
    "id": "terminal:btcgold",
    "title": "ביטקוין / זהב",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-market.js"
    ],
    "flow": [
      "סדרות מחיר",
      "התאמת תאריכים ויחס",
      "גרף"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "סדרות מחיר\nהתאמת תאריכים ויחס\nגרף",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "btcgold"
  },
  {
    "id": "terminal:pcr",
    "title": "יחס Put / Call",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-risk.js"
    ],
    "flow": [
      "נתוני אופציות",
      "יחס וניקוד",
      "תצוגה"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "נתוני אופציות\nיחס וניקוד\nתצוגה",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "pcr"
  },
  {
    "id": "terminal:housing",
    "title": "דיור",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-risk.js"
    ],
    "flow": [
      "סדרות דיור",
      "מדדים",
      "תצוגה"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "סדרות דיור\nמדדים\nתצוגה",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "housing"
  },
  {
    "id": "terminal:seasonality",
    "title": "עונתיות",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-seasonality.js"
    ],
    "flow": [
      "היסטוריית מחירים",
      "תשואות עונתיות",
      "השוואה"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "היסטוריית מחירים\nתשואות עונתיות\nהשוואה",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "seasonality"
  },
  {
    "id": "terminal:sectors",
    "title": "סקטורים",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-equities.js"
    ],
    "flow": [
      "מחירי ETF",
      "שינוי ודירוג סקטורים",
      "תצוגה"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "מחירי ETF\nשינוי ודירוג סקטורים\nתצוגה",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "sectors"
  },
  {
    "id": "terminal:breadth",
    "title": "רוחב שוק",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-equities.js"
    ],
    "flow": [
      "נתוני שוק",
      "מדדי רוחב",
      "תצוגה"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "נתוני שוק\nמדדי רוחב\nתצוגה",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "breadth"
  },
  {
    "id": "terminal:research",
    "title": "מחקר חברות",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-equities.js",
      "supabase/functions/wave-data/calculations.ts",
      "supabase/functions/wave-data/calculation-service.ts"
    ],
    "flow": [
      "נתוני ספק ו־SEC",
      "התאמת תקופות",
      "14 נוסחאות שרת",
      "מדדי חברה"
    ],
    "sources": [
      "SEC Company Facts",
      "נתוני חברה מהספק; נוסחאות הספק אינן בשליטתנו"
    ],
    "coverage": "source_mapped",
    "editing": "live_formulas",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "14 הנוסחאות מחוברות למנגנון תצוגה מקדימה ופרסום עם נעילת גרסה. טיוטת התהליך הכללית אינה משנה אותן.",
    "draft_defaults": {
      "rules": "נתוני ספק ו־SEC\nהתאמת תקופות\n14 נוסחאות שרת\nמדדי חברה",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "research"
  },
  {
    "id": "terminal:valuation",
    "title": "הערכת שווי",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-valuation.js"
    ],
    "flow": [
      "קלטי חברה ותרחיש",
      "מודל הערכת שווי",
      "תוצאה"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "קלטי חברה ותרחיש\nמודל הערכת שווי\nתוצאה",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "valuation"
  },
  {
    "id": "terminal:mover",
    "title": "מניעי מחיר",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal.js"
    ],
    "flow": [
      "אירועים ומחיר",
      "תאריכי פרסום וחיתוך מידע",
      "ראיות לתנועה"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "אירועים ומחיר\nתאריכי פרסום וחיתוך מידע\nראיות לתנועה",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "mover"
  },
  {
    "id": "terminal:institutions",
    "title": "מוסדיים",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-equities.js"
    ],
    "flow": [
      "דיווחי אחזקות",
      "תקופות דיווח",
      "השוואת אחזקות"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "דיווחי אחזקות\nתקופות דיווח\nהשוואת אחזקות",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "institutions"
  },
  {
    "id": "terminal:fundchart",
    "title": "גרפים פונדמנטליים",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-equities.js"
    ],
    "flow": [
      "דוחות חברה",
      "התאמת תקופות ויחידות",
      "גרף"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "דוחות חברה\nהתאמת תקופות ויחידות\nגרף",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "fundchart"
  },
  {
    "id": "terminal:confluence",
    "title": "מפגש אותות",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-confluence.js"
    ],
    "flow": [
      "אותות ממקורות שונים",
      "שילוב לפי חלון זמן",
      "תצוגה"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "אותות ממקורות שונים\nשילוב לפי חלון זמן\nתצוגה",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "confluence"
  },
  {
    "id": "terminal:earnings",
    "title": "דוחות כספיים",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-earnings.js"
    ],
    "flow": [
      "לוח דוחות ונתוני חברה",
      "סטטוס דיווח",
      "תצוגה"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "לוח דוחות ונתוני חברה\nסטטוס דיווח\nתצוגה",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "earnings"
  },
  {
    "id": "terminal:correlation",
    "title": "קורלציה",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-equities.js"
    ],
    "flow": [
      "סדרות מיושרות",
      "מתאם לפי חלון",
      "מטריצה"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "סדרות מיושרות\nמתאם לפי חלון\nמטריצה",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "correlation"
  },
  {
    "id": "terminal:comm-flows",
    "title": "זרימות הון",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-flows.js"
    ],
    "flow": [
      "דיווחי זרימות ואחזקות",
      "מדדים לפי תאריך פרסום",
      "תצוגה"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "דיווחי זרימות ואחזקות\nמדדים לפי תאריך פרסום\nתצוגה",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "comm-flows"
  },
  {
    "id": "terminal:ev",
    "title": "תעשיית הרכב החשמלי",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-industries.js"
    ],
    "flow": [
      "נתוני תעשייה",
      "מדדי השוואה",
      "תצוגה"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "נתוני תעשייה\nמדדי השוואה\nתצוגה",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "ev"
  },
  {
    "id": "terminal:crypto",
    "title": "קריפטו",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-crypto.js"
    ],
    "flow": [
      "מחירי שוק ונתוני רשת",
      "קבוצות ומדדים",
      "תצוגה"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "מחירי שוק ונתוני רשת\nקבוצות ומדדים\nתצוגה",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "crypto"
  },
  {
    "id": "terminal:scanner",
    "title": "סורק קריפטו",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-crypto.js"
    ],
    "flow": [
      "נתוני שוק",
      "סינון ודירוג",
      "תצוגה"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "נתוני שוק\nסינון ודירוג\nתצוגה",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "scanner"
  },
  {
    "id": "terminal:backtest",
    "title": "בדיקת אסטרטגיה",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal_app.html"
    ],
    "flow": [
      "עמוד מציין מקום קיים באתר; טרם נמצא מנגנון פעיל"
    ],
    "sources": [
      "לא מחובר: העמוד מסומן Coming soon"
    ],
    "coverage": "not_connected",
    "editing": "draft_only",
    "schedule": "לא נמצא מנגנון פעיל",
    "dependencies": [],
    "runtime_notes": "מציין מקום בלבד. אפשר לנסח טיוטת תכנון; אין תהליך פעיל לעריכה.",
    "draft_defaults": {
      "rules": "תכנון תהליך עתידי בלבד; העמוד הקיים הוא מציין מקום.",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "backtest"
  },
  {
    "id": "terminal:ideas",
    "title": "רעיונות",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal_app.html"
    ],
    "flow": [
      "עמוד מציין מקום קיים באתר; טרם נמצא מנגנון פעיל"
    ],
    "sources": [
      "לא מחובר: העמוד מסומן Coming soon"
    ],
    "coverage": "not_connected",
    "editing": "draft_only",
    "schedule": "לא נמצא מנגנון פעיל",
    "dependencies": [],
    "runtime_notes": "מציין מקום בלבד. אפשר לנסח טיוטת תכנון; אין תהליך פעיל לעריכה.",
    "draft_defaults": {
      "rules": "תכנון תהליך עתידי בלבד; העמוד הקיים הוא מציין מקום.",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "ideas"
  },
  {
    "id": "terminal:sources",
    "title": "מקורות ומתודולוגיה",
    "category": "terminal",
    "version": "1",
    "files": [
      "apps/terminal/public/terminal-sources.js"
    ],
    "flow": [
      "רישומי מקור מכל מודול",
      "איחוד לפי מפתח",
      "דף מקורות"
    ],
    "sources": [
      "נתיבי המקור במודול; פירוט ספק לכל קריאה טרם נמדד"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "לפי טעינת העמוד; רענון פנימי תלוי מודול",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "רישומי מקור מכל מודול\nאיחוד לפי מפתח\nדף מקורות",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    },
    "page": "sources"
  },
  {
    "id": "data-engine",
    "title": "מנוע הנתונים",
    "category": "operations",
    "version": "1",
    "files": [
      "services/api/data_engine/run.py",
      "services/api/data_engine/collectors.py",
      "services/api/data_engine/flask_snapshots.py",
      "services/api/data_engine/page_snapshots.py",
      ".github/workflows/data-engine.yml"
    ],
    "flow": [
      "בדיקת תוקף",
      "דילוג או איסוף",
      "חישוב וצילום מצב",
      "פרסום קיים",
      "ראיות ריצה נפרדות"
    ],
    "sources": [
      "Yahoo Finance / CBOE / Binance / Forex Factory לפי collector",
      "נתיבי Flask ומאגר snapshots הקיים"
    ],
    "coverage": "artifact_prepared",
    "editing": "draft_only",
    "schedule": "7 * * * * (UTC); TTL אפקטיבי לפחות שעה",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "בדיקת תוקף\nדילוג או איסוף\nחישוב וצילום מצב\nפרסום קיים\nראיות ריצה נפרדות",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    }
  },
  {
    "id": "full-validation",
    "title": "Full Validation",
    "category": "operations",
    "version": "1",
    "files": [
      ".github/workflows/stabilization-ci.yml",
      ".github/workflows/production-qa.yml",
      ".github/workflows/browser-qa.yml",
      "scripts/static_contract_check.py",
      "scripts/route_contract_check.py"
    ],
    "flow": [
      "בדיקות תחביר",
      "חוזי נתונים",
      "בדיקות חישובים והרשאות",
      "בדיקות דפדפן",
      "סקירת תוצאות"
    ],
    "sources": [
      "קוד ובדיקות במאגר",
      "אין מפעיל מרכזי בשם Full Validation; זהו מיפוי של בדיקות קיימות"
    ],
    "coverage": "source_mapped",
    "editing": "draft_only",
    "schedule": "אירועי CI לפי כל workflow; אין כפתור הפעלה מחובר",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "בדיקות תחביר\nחוזי נתונים\nבדיקות חישובים והרשאות\nבדיקות דפדפן\nסקירת תוצאות",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    }
  },
  {
    "id": "presentations",
    "title": "מצגות",
    "category": "content",
    "version": "1",
    "files": [],
    "flow": [
      "מחקר",
      "בחירת ראיות",
      "שקפים",
      "בדיקת מספרים וגרפים",
      "תוצר"
    ],
    "sources": [
      "יצרן המצגות לא נמצא במאגר ולא מחובר"
    ],
    "coverage": "not_connected",
    "editing": "draft_only",
    "schedule": "לא ידוע",
    "dependencies": [],
    "runtime_notes": "אין עדיין היסטוריית ריצות מחוברת למסך זה. מיפוי קוד אינו ראיה להרצה.",
    "draft_defaults": {
      "rules": "מחקר\nבחירת ראיות\nשקפים\nבדיקת מספרים וגרפים\nתוצר",
      "validation": "תאריך מקור, יחידות ותקופת הנתון חייבים להיות גלויים; מידע חסר אינו אפס.",
      "reason": ""
    }
  }
];
