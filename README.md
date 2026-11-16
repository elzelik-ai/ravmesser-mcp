# שרת MCP לרב מסר (Responder Live)

השרת מחבר את Claude לחשבון רב מסר דרך ה-API הרשמי של הגרסה החדשה, Responder Live V2
([תיעוד](https://app.swaggerhub.com/apis/Responder/responder/V2.0)).

## מה Claude יוכל לעשות

| תחום | כלים |
|---|---|
| רשימות | `list_lists`, `get_list`, `create_list`, `get_list_subscribers`, `get_list_fields` |
| נרשמים | `get_subscriber`, `search_subscribers`, `add_subscriber`, `update_subscriber`, `set_list_subscription`, `unsubscribe`, `resubscribe`, `remove_from_list`, `delete_subscriber` |
| שדות אישיים | `get_personal_fields`, `create_personal_field`, `update_personal_field` |
| תגיות | `list_tags`, `get_subscriber_tags`, `create_tag`, `remove_tag` |
| רשימת חסומים | `list_blocked`, `block_contact`, `unblock_contact` |

> ה-API של רב מסר לא מאפשר ליצור דיוורים או לשלוח אותם. את זה עושים במערכת עצמה.

**הגנות:**
- הסרה מרשימה ומחיקת נרשם דורשות `confirm: true`. Claude יבקש מכם אישור לפני שהוא ממלא את השדה.
- `RESPONDER_READ_ONLY=true` משאיר רק כלי קריאה.
- כתובת השרת מוגנת בטוקן סודי.

## מפתחות

ברב מסר נכנסים להגדרות ← **חיבורים חיצוניים (API)** ← **מפתח כללי לחשבון**, ומדליקים את המתג.
משם מעתיקים שלושה ערכים למשתני הסביבה בשרת:

| משתנה | ערך מרב מסר |
|---|---|
| `RESPONDER_CLIENT_ID` | Client ID |
| `RESPONDER_CLIENT_SECRET` | Client Secret |
| `RESPONDER_USER_TOKEN` | User Token |

## המערכת הישנה של רב מסר (לא חובה)

אפשר לחבר לאותו שרת גם את המערכת הישנה (api.responder.co.il).
את המפתחות שלה מקבלים מהתמיכה של רב מסר בטלפון 03-7177777: מבקשים "מפתחות REST API למערכת הישנה".
מקבלים ארבעה ערכים:

| משתנה | ערך |
|---|---|
| `OLD_RESPONDER_CLIENT_KEY` | Client Key |
| `OLD_RESPONDER_CLIENT_SECRET` | Client Secret |
| `OLD_RESPONDER_USER_KEY` | User Key |
| `OLD_RESPONDER_USER_SECRET` | User Secret |

כשכל ארבעת הערכים מוגדרים, נוספים לשרת 25 כלים ששמם מתחיל ב-`old_`.
בין השאר: רשימות, נרשמים, שדות אישיים, קבוצות משלוח (Views), וגם **יצירת דיוורים, שליחת בדיקה ושליחה לרשימה**.
את שליחת הדיוור ל-API הישן אפשר לבצע רק אחרי אישור מפורש (`confirm: true`).

## אחסון ב-Render

הקובץ `render.yaml` מגדיר שירות Node במסלול החינמי. את `MCP_ACCESS_TOKEN` מגדירים כמחרוזת אקראית.

## חיבור ל-Claude

ב-claude.ai נכנסים ל-**Customize ← Connectors ← Add ← Add custom connector** ומזינים:

```
https://<השרת-שלכם>/mcp/<MCP_ACCESS_TOKEN>
```

## הרצה מקומית

```bash
npm install
```

```bash
npm test
```

ב-Claude Code מחברים את השרת כך:

```bash
claude mcp add ravmesser --env RESPONDER_CLIENT_ID=... --env RESPONDER_CLIENT_SECRET=... --env RESPONDER_USER_TOKEN=... -- node /path/to/ravmesser-mcp/src/stdio.js
```
