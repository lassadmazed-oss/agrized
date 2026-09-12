# Cahier des charges fonctionnel & technique — AgriZed

## مشروع المليون زيتونة — النسخة المرجعية الكاملة (v2)

> ثُبّتت يوم 2026-09-12 كالنسخة المرجعية «من A إلى Z» للمطوّر. عند أي تعارض مع النسخة 1.1 (كراس الشروط الأولى)
> تُطبَّق هذه النسخة. القاعدة المحورية: **AgriZed تنطلق من الزيتونة، موش من المتر المربع**. الـFront، الـBack Office،
> الـBackend، الـCRM، التسعير، الحجز، العقود، المتابعة… الكل يُبنى على المنطق هذا.

### 1. تعريف AgriZed

**AgriZed** هي منصّة تونسية لإدارة **مشروع المليون زيتونة**.

المشروع مبني على فكرة بسيطة:

> **كل واحد فينا ينجم يكون فاعل في مشروع المليون زيتونة حسب مقدرته.**

الشخص ما يبدأش بالسؤال: «قداش نحب متر مربع؟»

يبدأ بالسؤال:

> **قداش زيتونة نحب نبدأ بيهم؟**

25 زيتونة، 50، 100، 250، 500 أو عدد آخر.

AgriZed من بعد تترجم اختياره إلى مشروع حقيقي: نوع الزيتون، عدد الوحدات، مساحة الأرض، السعر، طريقة الدفع، الزيارة، الحجز، الإجراءات القانونية، ثم المتابعة بعد التملّك.

المنصة **ما تبنيش خطابها التسويقي على العائد والربح**. الخطاب يكون حول:

**الزيتونة، الملكية، الأرض، المشروع الجماعي، المشاركة حسب القدرة، والمتابعة.**

---

# 2. القاعدة الأساسية الجديدة

أهم قاعدة في كامل النظام:

> **Primary user-facing unit = Olive Tree / الزيتونة**

والمتر المربع يصبح معلومة مشتقة من المشروع، وليس نقطة البداية.

يعني:

**Front Office:** زيتونة أولاً.

**Backend:** يحسب الوحدات والمساحة والسعر.

**Back Office:** الإدارة تحدد قواعد كل مشروع.

---

# 3. لا توجد قاعدة عامة بين الزيتونة والمساحة

المطور ممنوع يعمل قاعدة عامة مثل:

**1 زيتونة = 500 م²**

أو:

**25 زيتونة = 500 م²**

هذه تكون قواعد **خاصة بكل Project**.

مثلاً:

### Project A — زيتون تقليدي كبير

فرضية:

**1 Unit = زيتونة تقليدية كبيرة + حوالي 500 م²**

إذا الحريف اختار 10 زيتونات:

10 Units.

المساحة التقريبية:

5,000 م².

### Project B — غراسة مكثفة

فرضية:

**1 Unit = 500 م² = 25 زيتونة**

إذا اختار 250 زيتونة:

250 ÷ 25 = 10 Units.

المساحة:

10 × 500 = 5,000 م².

### Project C — أرض بيضاء

1 Unit يمكن أن تكون:

**500 م² أرض بيضاء**

وعدد الأشجار المستقبلية يحدد حسب الدراسة الفنية.

هذه القيم **كلها Configurable من الـBack Office**.

---

# 4. مفهوم Unit

كل Project لازم يحتوي على `Unit Template`.

الـUnit هي أصغر وحدة تجارية للمشروع.

مثلاً:

**Project Name:** AgriZed Sidi Bouzid 01
**Unit size:** 500 m²
**Trees per Unit:** 25
**Plantation Type:** Intensive
**Production Status:** Young / Productive
**Cash Price:** X
**Pricing Matrix:** خاصة بالمشروع.

المستخدم يمكنه شراء 1 Unit، 2 Units، 10 Units...

---

# 5. هدف «المليون زيتونة»

الـHomepage لازم تعطي الانطباع أن AgriZed **مشروع جماعي كبير**.

العنوان الرئيسي:

> **مشروع المليون زيتونة**

والرسالة:

> **كل واحد فينا ينجم يكون فاعل فيه حسب مقدرته.
> اختار قداش زيتونة تحب تبدأ بيهم، وإحنا نرافقوك في الباقي.**

CTA:

**سجّل مطلبك**

CTA ثانوي:

**اكتشف كيفاش تخدم AgriZed**

---

# 6. عدّاد المشروع

نحتاج Dashboard Public واضح فيه أرقام حقيقية فقط.

يجب الفصل بين:

**زيتونات مطلوبة:** مجموع الزيتونات الموجودة في مطالب المستخدمين.

**زيتونات محجوزة:** مرتبطة بحجوزات فعلية.

**زيتونات تم التعاقد عليها:** عقود فعلية.

**زيتونات مغروسة / موجودة فعلياً:** مشاريع منجزة.

ما نخلطوش بينهم.

مثلاً:

**هدف المشروع:** 1,000,000

**الطلبات:** 320,450 زيتونة

**المحجوز:** 48,200

**المملوك/المتعاقد عليه:** 26,400

الأرقام تتولد أوتوماتيكياً من قاعدة البيانات.

---

# 7. Homepage UX

بعد الـHero:

### «المليون تبدأ بزيتونة»

الرسالة:

> واحد يبدأ بـ25، واحد بـ100، واحد بـ250.
> كل واحد حسب مقدرته، وكل زيتونة تقربنا من الهدف.

ثم CTA مهم:

> **قداش زيتونة تحب تبدأ بيهم؟**

Cards:

25
50
100
250
500
عدد آخر.

---

# 8. اختيار نوع المشروع

بعد اختيار عدد الزيتونات:

> **كيفاش تحب مشروعك يكون؟**

الخيارات:

**زيتونة تقليدية كبيرة ومنتجة**

**غراسة مكثفة**

**زيتون صغير في طور النمو**

**زيتون قريب للإنتاج**

**أرض بيضاء تتغرس**

**اقترحولي الأنسب**

كل Card فيها صورة وتفسير قصير.

---

# 9. اختيار المكان

السؤال:

> **وين تحب مشروعك يكون؟**

الخيارات:

ولاية معينة.

أكثر من ولاية.

أو:

> **المكان موش مهم، اقترحولي المشروع المناسب.**

---

# 10. Matching أولي

بعد:

عدد الزيتونات + نوع المشروع + المنطقة،

الـBackend يبحث في المشاريع المتوفرة.

إذا يوجد Project مناسب:

يظهر للمستخدم.

إذا لا يوجد:

النظام يقول:

> **حالياً ما عناش مشروع مطابق 100% لاختياراتك. سجّل مطلبك ونرجعولك أول ما يتوفر.**

هذا مهم جداً لأن AgriZed تنطلق في المرحلة الأولى من **الطلب قبل شراء الأراضي**.

---

# 11. بطاقة العرض

إذا يوجد Project فعلي، المستخدم يشوف Card واضحة.

مثال:

### «زيتونة تقليدية كبيرة»

زيتونة واحدة.

المساحة المرتبطة: تقريباً 500 م².

الحالة: منتجة.

الموقع: ...

**السعر حاضر:** مثلاً 7,000 د.ت.

ثم:

> **شوف طرق الدفع**

---

# 12. أنواع عروض مختلفة

كل Offer عنده Pricing مستقل.

مثلاً كفرضيات فقط:

### الزيتونة التقليدية الكبيرة

1 زيتونة + 500 م² تقريباً.
Cash: 7,000 أو 8,000 د.ت.

### غراسة مكثفة

25 زيتونة + 500 م².
Cash: 10,000 د.ت.

### أرض بيضاء

500 م².
Cash: 3,000 د.ت.

هذه **أمثلة فقط**.

الإدارة تغيّر الأرقام من الـBack Office.

---

# 13. Pricing Engine

ما نحبوش Formula مالية جامدة.

الأفضل يكون عندنا:

## Pricing Matrix

لكل Offer، الإدارة تدخل سيناريوهات.

مثال أرض بيضاء:

| طريقة الدفع | السعر الجملي |
| ----------- | -----------: |
| حاضر        |    3,000 د.ت |
| تسبقة 2,000 |    3,500 د.ت |
| تسبقة 1,000 |    4,000 د.ت |
| تسبقة 500   |    5,000 د.ت |

هذا مثال فقط.

ثم النظام يحسب الرصيد والمدة حسب القسط.

---

# 14. القسط الشهري

لكل Offer يوجد:

`minimum_monthly_payment`

مثلاً:

**Minimum = 70 TND**

الخيارات:

70
80
100
150
200

ولا يمكن للحريف اختيار أقل من Minimum.

---

# 15. حساب المدة

مثال:

Final Price = 4,000.

Down Payment = 1,000.

Remaining = 3,000.

إذا القسط:

70 د.ت → حوالي 43 شهر.

100 د.ت → 30 شهر.

150 د.ت → 20 شهر.

الـBackend يحسبها أوتوماتيكياً.

---

# 16. تعدد الوحدات

إذا سعر وتسبيق وقسط الـUnit معروفين، الحريف اللي يختار عدة Units يشوف الأرقام مضروبة في عدد الـUnits، إلا إذا الإدارة وضعت Pricing خاص للكميات.

مثلاً:

Unit:

25 زيتونة.

500 م².

تسبقة = 1,000.

قسط = 70.

الحريف اختار 250 زيتونة:

10 Units.

تسبقة:

10,000.

قسط:

700/شهر.

لكن الإدارة يجب أن يكون عندها الحق في إنشاء **Bulk Pricing** مختلف إذا حبت.

---

# 17. شاشة «مشروعي»

أثناء الـFlow، Card ثابتة تتحدث Live:

> **مشروعي**

عدد الزيتونات: 250.

نوع المشروع: مكثف.

عدد الوحدات: 10.

المساحة المقدرة: 5,000 م².

التسبقة: X.

القسط: Y.

المدة: Z شهر.

السعر الجملي: N.

ويظهر:

> هذا تصور حسب المشروع المختار. التفاصيل النهائية موجودة في بطاقة المشروع والعقد.

---

# 18. تسجيل المطلب

إذا المستخدم اقتنع أو ما لقا حتى Project جاهز:

> **سجّل مطلبي**

البيانات:

الاسم واللقب.

الهاتف.

WhatsApp.

الولاية.

طريقة التواصل:

هاتف / WhatsApp / الاثنين.

أفضل وقت:

صباح / بعد الظهر / مساء.

---

# 19. رقم المطلب

بعد التسجيل:

> **مطلبك تسجّل بنجاح**

مثلاً:

**AZ-2026-001854**

مع:

عدد الزيتونات المطلوبة.

نوع المشروع.

المنطقة.

القدرة المالية.

ولا يوجد التزام بالشراء.

---

# 20. CRM

كل Demand تدخل إلى CRM.

الـLead يحتوي على:

Customer ID.

Demand ID.

الاسم.

الهاتف.

WhatsApp.

عدد الزيتونات.

نوع المشروع.

Region.

Preferred Offer.

Down-payment capacity.

Monthly-payment capacity.

Source.

Status.

Assigned Commercial.

Score.

Next Action.

Notes.

---

# 21. توزيع الـLeads

في البداية:

**Admin assigns manually.**

الإدارة تختار الـCommercial.

في المستقبل يمكن إضافة توزيع أوتوماتيكي.

---

# 22. Duplicate Detection

رقم الهاتف هو المفتاح الرئيسي لاكتشاف التكرار.

إذا نفس الرقم موجود:

النظام ينبه:

> **هذا الحريف موجود من قبل.**

ولا ينشئ Lead جديد بدون تأكيد.

---

# 23. Interface Commercial

الـCommercial يشوف:

الحريف.

رقم الهاتف.

طلبه.

عدد الزيتونات.

نوع المشروع.

المنطقة.

التسبقة.

القسط.

Score.

آخر اتصال.

Next Step.

Speech أسئلة المكالمة يكون قدامه.

---

# 24. Qualification Script

الـCommercial يسأل:

شنو جذبك للمشروع؟

قداش زيتونة تحب؟

شنو النوع اللي يناسبك؟

المكان مهم وإلا لا؟

قداش تسبقة مريحة ليك؟

قداش شهرياً؟

في حالة Project مناسب، تنجم تعمل زيارة؟

إذا عجبك، تنجم تعمل حجز؟

كل جواب يتخزن Structured Data وليس Notes فقط.

---

# 25. Lead Scoring

Score من 100.

عناصر مثل:

وضوح الطلب.

القدرة المالية.

الاستعداد للتحرك.

الاستعداد للزيارة.

الاستعداد للحجز.

ثم تصنيف:

**Hot**

**Warm**

**Follow-up**

**Cold**

---

# 26. المشاريع

Project entity يحتوي على:

Name.

Reference.

Governorate.

Delegation.

GPS/location.

Total area.

Legal status.

Plantation type.

Irrigation.

Olive variety.

Tree age.

Production status.

Unit definition.

Total Units.

Available Units.

Pricing Matrix.

Annual service plan.

Photos.

Documents.

Status.

---

# 27. Parcels

Project يمكن تقسيمه إلى:

P01
P02
P03...

كل Parcel عندها:

Area.

Number of Units.

Number of trees.

Type.

Status.

Price.

Customer.

Reservation.

Contract.

Documents.

---

# 28. حالات القطعة

Available.

Interested.

Reserved.

Contract in progress.

Contracted.

Owned.

Suspended.

---

# 29. Rendez-vous

إذا الـLead Qualified:

Commercial يضغط:

**Planifier une visite**

يدخل:

Project.

Date.

Time.

Meeting point.

Commercial.

Notes.

النظام يرسل SMS/WhatsApp.

---

# 30. بعد الزيارة

الـCommercial يسجل:

حضر / ما حضرش.

المشروع عجبو / لا.

القطعة المختارة.

الـOffer المختار.

Next Step.

---

# 31. العربون

إذا قرر يعمل Reservation:

Commercial يختار Parcel.

النظام يتثبت أنها Available.

يدخل:

Deposit amount.

Payment method.

Date.

Reservation duration.

مثلاً:

50 د.ت.

10 أيام.

---

# 32. Confirmation

يتولد:

Reservation ID.

Receipt.

Expiry Date.

والقطعة تولي:

**Reserved**

فوراً في جميع الواجهات.

---

# 33. Notifications

قبل Expiry:

3 أيام.

1 يوم.

يوم الانتهاء.

للـCommercial والـAdmin.

---

# 34. Promise to Sell

بعد الحجز:

إنشاء ملف:

**وعد بالبيع**

يحتوي:

Customer.

Parcel.

Total Price.

Down Payment.

Payment Plan.

Payment Method.

Legal document reference.

Signature Date.

---

# 35. الأقساط

Payment Plan يولّد:

Installment number.

Amount.

Due date.

Paid/unpaid.

Payment date.

Bank transaction reference.

Remaining balance.

---

# 36. التأخير

قبل القسط:

Reminder.

بعده:

Overdue.

لكن:

**لا يوجد فسخ آلي.**

النظام ينبه Legal/Admin.

القرار القانوني يتم خارج الـAutomation حسب العقد.

---

# 37. الجانب المالي الداخلي

الإدارة تشوف:

Cash collected.

Deposits.

Down payments.

Installments.

Remaining receivables.

Overdue.

Capital recovery.

Margin.

نحافظ داخلياً على الفصل:

**Capital Recovery**

عن:

**Margin / Profit**

---

# 38. التملّك

بعد اكتمال الشروط القانونية:

Parcel status:

**Owned**

ويتفتح للحريف:

# «زيتونتي»

---

# 39. زيتونتي

Owner Dashboard فيه:

عدد الزيتونات.

المساحة.

Project.

Parcel.

Photos.

Documents.

Plantation data.

Current status.

Annual services.

Harvest.

---

# 40. الاشتراك السنوي

الخدمات الفلاحية تدار عن طريق AgriZed وشركات خارجية.

الحريف يدفع:

**Annual fixed package**

يشمل، حسب الباقة:

حرث.

تقليم.

سقي.

سماد.

مداواة.

مراقبة.

متابعة تقنية.

الإدارة تحدد شنو داخل وشنو خارج الباقة.

---

# 41. العمليات الفلاحية

Back Office Agricultural يحتوي على:

Operation type.

Project.

Parcel.

Supplier.

Planned date.

Execution date.

Cost.

Photos.

Notes.

Approved by.

---

# 42. الشركات المتعاقدة

في النسخة الأولى:

**لا يوجد Supplier Portal.**

AgriZed تتعامل معهم خارج النظام.

وفريق AgriZed يسجل النتائج داخله.

Architecture لازم تبقى قابلة لإضافة Portal لاحقاً.

---

# 43. الصابة

Harvest Module يسجل:

Estimated harvest.

Actual quantity.

Harvest date.

Harvesting cost.

Pressing.

Oil quantity.

Storage.

Sale.

Owner decision.

---

# 44. اختيارات المالك

وقت الصابة:

**ناخذ الزيتون.**

**نعصره ونأخذ الزيت.**

**AgriZed تتكفل بالبيع.**

**التخزين.**

كل اختيار عنده تكلفته وشروطه.

---

# 45. Documents

النظام يخزن:

Reservations.

Receipts.

Promises of Sale.

Contracts.

Payment receipts.

Ownership documents.

Plans.

Technical reports.

Agricultural reports.

---

# 46. Back Office الرئيسي

Dashboard الإدارة يعرض:

Total Leads.

Olive trees requested.

Hot Leads.

Visits.

Reservations.

Contracts.

Projects.

Available Units.

Reserved Units.

Sold Units.

Collections.

Overdue payments.

Agricultural operations.

---

# 47. Filters

لازم الإدارة تنجم تسأل النظام مثلاً:

> قدّاش عنا عباد طالبين 250 زيتونة مكثفة في صفاقس بقسط حتى 100 د.ت؟

أو:

> قدّاش عنا طلب على الزيتون التقليدي المنتج؟

أو:

> شنو أكثر ولاية مطلوبة؟

---

# 48. Data Model الأساسي

الـBackend يجب أن يتضمن Entities منفصلة:

`User`

`Lead`

`Demand`

`Project`

`UnitTemplate`

`Offer`

`PricingMatrix`

`Parcel`

`Visit`

`Reservation`

`Contract`

`PaymentPlan`

`Payment`

`AnnualServicePlan`

`AgriculturalOperation`

`Harvest`

`Document`

`Notification`

`Staff`

`Role`

`AuditLog`

---

# 49. أهم العلاقات

Demand → Lead.

Lead → User.

Demand → requested olive quantity.

Offer → Project.

Project → UnitTemplate.

UnitTemplate → Tree quantity + Area.

Offer → PricingMatrix.

Reservation → Parcel + User.

Contract → Reservation.

PaymentPlan → Contract.

Zitounti → Owned Parcel.

---

# 50. صلاحيات المستخدمين

Roles:

Visitor.

Registered User.

Owner.

Commercial.

Commercial Manager.

Agricultural Manager.

Finance.

Legal.

Admin.

Super Admin.

كل Role عنده Permissions منفصلة.

---

# 51. Audit Log

أي عملية حساسة تسجل:

Who.

What.

Old value.

New value.

When.

Reason.

خصوصاً:

Prices.

Reservations.

Payments.

Contracts.

Parcel statuses.

---

# 52. Frontend

Mobile First.

Responsive.

Arabic RTL.

French LTR.

تصميم AgriZed:

Deep green.

Olive green.

Warm beige.

Gold accent.

UI بسيطة.

Cards كبيرة.

صور حقيقية.

---

# 53. Language Guidelines

نتجنب في الخطاب التسويقي:

«أرباح مضمونة»

«دخل مضمون»

«أفضل استثمار»

«مردودية مضمونة»

ونستعمل:

**مشروع**

**ملكية**

**زيتونة**

**أرض**

**مشاركة**

**متابعة**

**ابدأ حسب قدرتك**

---

# 54. نظام الإظهار والإخفاء

كل Module عنده:

`enabled_public`

الإدارة تنجم تظهر أو تخفي:

Projects.

Pricing.

Reservations.

Zitounti.

Harvest.

Public statistics.

في البداية يمكن إطلاق المنصة في:

**Demand Collection Mode فقط.**

ثم تفعيل الـMarketplace بعد جاهزية المشاريع.

---

# 55. المرحلة الأولى للإطلاق

Public:

Homepage.

Million Olive Trees.

How it Works.

Choose olive quantity.

Project preference.

Region.

Payment capacity.

Register demand.

Track demand.

Admin:

CRM.

Analytics.

Demand map.

Lead qualification.

---

# 56. المرحلة الثانية

Projects.

Offers.

Pricing Engine.

Visits.

Parcels.

Reservations.

Deposits.

---

# 57. المرحلة الثالثة

Contracts.

Installments.

Finance.

Ownership.

---

# 58. المرحلة الرابعة

Zitounti.

Agricultural management.

Annual subscriptions.

Harvest management.

---

# 59. أهم قاعدة للمطور

النظام **لازم يكون Data-Driven**.

ممنوع Hard-code:

عدد الزيتونات.

المساحات.

الأسعار.

التسبقات.

الأقساط.

المدد.

عدد الوحدات.

رسائل الواجهة.

كلها تعدّل من الـBack Office.

---

# 60. الجملة المرجعية النهائية للمشروع

المطور يلزم يقرأ ويفهم الجملة هذه قبل ما يبدأ:

> **AgriZed ليست موقعاً لبيع المساحات.
> هي منظومة مشروع المليون زيتونة.
> المستخدم يبدأ بعدد الزيتونات اللي يحب يكون فاعل بيهم، وAgriZed تترجم اختياره إلى مشروع، أرض، وحدات، سعر وخطة دفع.
> ومن التسجيل إلى الزيارة والحجز والتملّك ثم المتابعة الفلاحية، المنصة تدير الرحلة كاملة.**

هاذي **النسخة اللي نعتبرها المرجع الأساسي للمطور**. أي واجهة أو Feature جديدة تتراجع قدّام المنطق هذا: **هل تبدأ من الزيتونة وتخدم مشروع المليون زيتونة؟ إذا نعم، ماشية في الاتجاه الصحيح.**
