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
