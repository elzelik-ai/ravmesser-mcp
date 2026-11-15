# שרת MCP לרב מסר (Responder)

השרת מחבר את Claude לחשבון רב מסר דרך ה-API הרשמי שלהם
([תיעוד](https://github.com/responder/restapi)).

## מה Claude יוכל לעשות

| תחום | כלים |
|---|---|
| רשימות | `list_lists`, `create_list`, `update_list`, `delete_list` |
| נרשמים | `get_subscribers`, `add_subscribers`, `update_subscribers`, `delete_subscribers` |
| שדות אישיים | `get_personal_fields`, `create_personal_fields`, `update_personal_fields`, `delete_personal_fields` |
| קבוצות משלוח (Views) | `get_views`, `create_views`, `rename_views`, `delete_views`, `get_view_subscribers`, `add_view_subscribers`, `remove_view_subscribers` |
| הודעות | `get_messages`, `create_message`, `update_message`, `test_message`, `send_message`, `delete_messages` |

**הגנות:**
- מחיקה ושליחה לרשימה דורשות שדה `confirm: true`. Claude יבקש מכם אישור לפני שהוא ממלא אותו.
- `create_message` רק יוצר טיוטה ולא שולח אותה.
- `RESPONDER_READ_ONLY=true` משאיר רק כלי קריאה.

## שלב 1: מפתחות מרב מסר

מתקשרים לתמיכה של רב מסר בטלפון 03-7177777, או כותבים ל-support@responder.co.il,
ומבקשים **מפתחות REST API**. מקבלים ארבעה ערכים:

- Client Key
- Client Secret
- User Key
- User Secret

## שלב 2: אחסון השרת (דוגמה עם Render)

1. מעלים את התיקייה הזו לריפו **פרטי** ב-GitHub.
2. ב-[Render](https://render.com) בוחרים **New → Blueprint** ומחברים את הריפו. הקובץ `render.yaml` מגדיר את הכול.
3. מזינים את ארבעת המפתחות של רב מסר. את `MCP_ACCESS_TOKEN` ‏Render מייצר לבד.
4. אחרי הפריסה מעתיקים את כתובת השירות (למשל `https://ravmesser-mcp.onrender.com`) ואת הערך של `MCP_ACCESS_TOKEN`.

אפשר לאחסן גם בכל שירות שמריץ Docker (Railway, Fly.io, שרת משלכם) בעזרת ה-`Dockerfile`.

## שלב 3: חיבור ל-Claude

ב-claude.ai נכנסים ל-**Settings → Connectors → Add custom connector** ומזינים:

```
https://<הכתובת-שלכם>/mcp/<MCP_ACCESS_TOKEN>
```

> הכתובת הזו היא בעצם הסיסמה. לא משתפים אותה. אם היא דלפה, מחליפים את `MCP_ACCESS_TOKEN` ב-Render.

## חלופה: הרצה מקומית (Claude Desktop / Claude Code)

```bash
npm install
```

ב-Claude Code:

```bash
claude mcp add ravmesser --env RESPONDER_CLIENT_KEY=... --env RESPONDER_CLIENT_SECRET=... --env RESPONDER_USER_KEY=... --env RESPONDER_USER_SECRET=... -- node /path/to/ravmesser-mcp/src/stdio.js
```

## בדיקות

```bash
npm test
```

הבדיקות רצות מול שרת מדומה של רב מסר, ובודקות חתימת אימות, פורמט בקשות ודרישת האישור.
