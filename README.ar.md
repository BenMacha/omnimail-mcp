<p align="center">
  <img src="assets/logo-wordmark.svg" alt="omnimail MCP" width="640">
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.fr.md">Français</a> · <b>العربية</b>
</p>

<p align="center">
  <a href="https://github.com/BenMacha/omnimail-mcp/actions/workflows/ci.yml"><img src="https://github.com/BenMacha/omnimail-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/BenMacha/omnimail-mcp/actions/workflows/codeql.yml"><img src="https://github.com/BenMacha/omnimail-mcp/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"></a>
  <img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="AGPL-3.0">
  <img src="https://img.shields.io/badge/node-%E2%89%A520-339933" alt="Node ≥ 20">
  <img src="https://img.shields.io/badge/MCP-stdio%20%7C%20HTTP-4338CA" alt="MCP stdio | HTTP">
</p>

<div dir="rtl">

**omnimail** خادم **MCP** (بروتوكول سياق النموذج) مفتوح المصدر يربط **جميع صناديق بريدك** — iCloud وGmail وYahoo وInfomaniak وProton وأي خادم IMAP — بمساعدك الذكي: **Claude Code وClaude Desktop وClaude.ai وChatGPT وPerplexity**.

ابحث في كل حساباتك دفعة واحدة، واكتشف المرسلين المتكررين وألغِ اشتراكك فيهم، ورتّب رسائلك في مجلدات فرعية (مع إمكانية التراجع)، ونظّف صندوقك، واكشف رسائل الاحتيال، وجهّز الردود — مع بقاء بياناتك تحت سيطرتك.

> **الحالة: الإصدار 0.1.0 — نسخة محلية تعمل.** دعم Outlook وOAuth والوضع المستضاف والأرشفة المجدولة ضمن [خطة العمل](docs/PLAN.md).

## المحتويات

- [الميزات](#الميزات)
- [التثبيت](#التثبيت)
- [إضافة حساباتك](#إضافة-حساباتك)
- [أمثلة على الطلبات](#أمثلة-على-الطلبات)
- [مزوّدو البريد](#مزوّدو-البريد)
- [الإعدادات](#الإعدادات)
- [الأمان والخصوصية](#الأمان-والخصوصية)
- [التطوير](#التطوير)
- [الترخيص](#الترخيص)

## الميزات

| المجال | أدوات MCP |
|---|---|
| الحسابات | `accounts_list`، `account_status` (حالة الاتصال أو سبب الفشل) |
| القراءة | `mail_search` (كل الحسابات بالتوازي)، `mail_get`، `attachment_get`، `folders_list` |
| المرسلون المتكررون | `recurring_senders_list`: الحجم والتكرار ونسبة القراءة وطريقة إلغاء الاشتراك |
| إلغاء الاشتراك | `unsubscribe_plan`: إلغاء بنقرة واحدة (RFC 8058) أو عبر البريد، مع ترتيب الرسائل القديمة |
| الترتيب | `classify_plan`: مجلدات فرعية حسب الفئة (فواتير، بنوك، طلبات، سفر، نشرات…) أو حسب المرسل أو بقواعد خاصة |
| التنظيف | `cleanup_plan`: إلى الأرشيف أو المهملات حسب الفئة أو المرسل أو القِدم أو الحجم |
| الخطط | `plan_apply` (بعد موافقتك)، `plan_undo` (التراجع)، `plans_list` |
| التنظيم | `mail_move`، `mail_mark` (مقروء، مهم) |
| البريد المزعج والاحتيال | `spam_check`: SPF / DKIM / DMARC، انتحال الهوية، الروابط المضللة، المرفقات الخطرة، طلبات تغيير الحساب البنكي |
| الردود | `draft_create`، `draft_reply`، `mail_send` (معطّل افتراضيًا) |
| المتابعة | `audit_log`، `settings_get` |

**كل تعديل جماعي يمر عبر خطة**: يعرض omnimail ما سيفعله، توافق أنت، ثم ينفّذ `plan_apply`. ويمكن **التراجع** عن أي خطة خلال 30 يومًا عبر `plan_undo` (ما عدا إلغاء الاشتراك بطبيعته).

مرفق أيضًا قوالب MCP ومهارات Claude Code: `morning-triage`، `newsletter-cleanup`، `sort-into-folders`، `deep-cleanup`، `scam-detector`، `pending-replies`. ويجيبك المساعد بلغتك.

## التثبيت

المتطلب: Docker.

**Claude Code — من متجر الإضافات في هذا المستودع (موصى به)**

</div>

```text
/plugin marketplace add BenMacha/omnimail-mcp
/plugin install omnimail@omnimail
```

<div dir="rtl">

**Claude Code — أمر مباشر**

</div>

```bash
claude mcp add omnimail -- docker run -i --rm -v omnimail-data:/data ghcr.io/benmacha/omnimail-mcp:latest
```

<div dir="rtl">

**Claude Desktop وPerplexity (ماك) وغيرها من عملاء stdio**

</div>

```json
{
  "mcpServers": {
    "omnimail": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-v", "omnimail-data:/data", "ghcr.io/benmacha/omnimail-mcp:latest"]
    }
  }
}
```

<div dir="rtl">

**العملاء الذين يطلبون رابطًا (Claude.ai وChatGPT)**

</div>

```bash
OMNIMAIL_HTTP_TOKEN=$(openssl rand -hex 24) docker compose --profile http up -d
# → http://127.0.0.1:3333/mcp  مع الترويسة  Authorization: Bearer <token>
```

<div dir="rtl">

النشر العام عبر HTTPS مع تسجيل الدخول بـ OAuth لـ Claude.ai وChatGPT يأتي في المرحلة 5؛ وحتى ذلك الحين هذا الوضع للاستخدام المحلي أو خلف وكيل HTTPS خاص بك.

## إضافة حساباتك

</div>

```bash
docker run -it --rm -v omnimail-data:/data ghcr.io/benmacha/omnimail-mcp:latest accounts add
docker run -it --rm -v omnimail-data:/data ghcr.io/benmacha/omnimail-mcp:latest accounts test
```

<div dir="rtl">

يتعرّف المعالج على المزوّد من العنوان، ويدلّك على مكان إنشاء **كلمة مرور التطبيق**، ويخفي ما تكتبه، ويختبر الاتصال قبل الحفظ. أوامر أخرى: `accounts list`، `accounts remove <id>`، `providers`، `settings get|set`.

لإبقاء مفتاح التشفير خارج مجلد البيانات (موصى به): استخدم سر Docker المسمى `omnimail_master_key` في `docker-compose.yml`، أو المتغير `OMNIMAIL_MASTER_KEY_FILE`.

## أمثلة على الطلبات

- «من هم المرسلون الذين يراسلونني كثيرًا ولا أقرأ رسائلهم؟ ألغِ اشتراكي في أول خمسة منهم ورتّب رسائلهم القديمة في مجلد.»
- «رتّب صندوق وارد iCloud في مجلدات فرعية حسب الفئة.» … ثم «تراجع عن ذلك.»
- «أرشف الإشعارات ورسائل الشبكات الاجتماعية التي قرأتها منذ أكثر من ستة أشهر في كل حساباتي.»
- «هل رسالة "PayPal" هذه احتيال؟»
- «ابحث عن فاتورة الكهرباء لشهر سبتمبر وجهّز ردًا لخدمة العملاء.»

## مزوّدو البريد

| المزوّد | طريقة الدخول | الحالة |
|---|---|---|
| iCloud Mail | كلمة مرور التطبيق | ✅ |
| Gmail / Google Workspace | كلمة مرور التطبيق (OAuth في المرحلة 4) | ✅ |
| Yahoo وAOL | كلمة مرور التطبيق | ✅ |
| Infomaniak | كلمة المرور (كلمة مرور تطبيق عند تفعيل التحقق بخطوتين) | ✅ |
| Proton Mail | عبر Proton Mail Bridge (ملف Docker `proton`) | ✅ |
| Fastmail وZoho وGMX وOVHcloud وأي خادم IMAP | IMAP/SMTP | ✅ |
| Outlook.com / Microsoft 365 | OAuth إلزامي من Microsoft | المرحلة 4 |

## الإعدادات

`omnimail settings set <key> <value>`

| المفتاح | الافتراضي | الدور |
|---|---|---|
| `sendEnabled` | `false` | السماح بـ `mail_send` (أو `OMNIMAIL_SEND_ENABLED=true`) |
| `language` | `en` | لغة المجلدات التي ينشئها omnimail: `en` أو `fr` أو `ar` (مثلًا `مرتب/الفواتير`) |
| `classifyRoot` | *(حسب اللغة)* | المجلد الجذر للترتيب |
| `maxActionsPerPlan` | `5000` | الحد الأقصى للرسائل في الخطة الواحدة |
| `planTtlMinutes` | `15` | مدة صلاحية الخطة قبل الموافقة |
| `searchLimitPerAccount` | `50` | عدد النتائج لكل حساب ومجلد |

لإنشاء المجلدات بالعربية: `omnimail settings set language ar`.

## الأمان والخصوصية

- **لا نستخدم أبدًا كلمة مرورك الرئيسية**: كلمات مرور التطبيقات فقط، ويمكنك إلغاؤها في أي وقت لدى المزوّد.
- الحسابات محفوظة في **خزنة مشفّرة** (AES-256-GCM بمفتاح مشتق عبر scrypt)؛ لا أسرار في ملفات `.env` أو السجلات أو ردود الأدوات.
- **لا نسخ لرسائلك**: القراءة عند الطلب فقط، والخطط لا تحفظ إلا المراجع ومعرّفات الرسائل.
- محتوى الرسائل يُسلَّم للذكاء الاصطناعي **موسومًا بأنه غير موثوق** (حماية من حقن التعليمات).
- الإرسال **معطّل افتراضيًا**؛ إلغاء الاشتراك يقتصر على روابط https العامة (حماية SSRF)؛ لا حذف نهائي أبدًا.
- سجل محلي لكل الإجراءات (`audit_log`)؛ حاوية بلا صلاحيات الجذر ونظام ملفات للقراءة فقط.

سياسة الأمان: [SECURITY.md](SECURITY.md).

## التطوير

</div>

```bash
npm ci
npm run check                               # lint + types + unit tests with coverage
docker compose -f docker/compose.test.yml up -d
npm run test:integration                    # end-to-end against GreenMail
```

<div dir="rtl">

التكامل المستمر عبر GitHub Actions: الفحص، واختبارات الوحدات على Node 20 و22 و24 مع قياس التغطية، والاختبارات الشاملة، واختبار صورة Docker وفحصها بـ Trivy، وCodeQL، ومراجعة الاعتماديات، ونشر الصورة على GHCR والإصدارات من الوسوم. راجع [CONTRIBUTING.md](CONTRIBUTING.md).

## الترخيص

[AGPL-3.0](LICENSE) — حر في الاستخدام والتعديل والاستضافة الذاتية؛ وأي نسخة معدّلة تُقدَّم كخدمة عبر الإنترنت يجب أن تنشر شيفرتها المصدرية.

</div>

---

<p align="center">
  <img src="assets/palestine-flag.svg" alt="علم فلسطين" width="72"><br>
  <b>فلسطين حرة — Free Palestine</b> 🇵🇸
</p>
