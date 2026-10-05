/**
 * The words of the journey sections — PROTOTYPE COPY, and the one place they live for now.
 *
 * WHY THEY ARE NOT IN `settings` YET, which is the project's rule and will be honoured. The owner asked for a
 * prototype of these sections BEFORE the final implementation, and the first thing a prototype gets told is
 * that the wording is wrong. Seeding seventy keys and four translations each for sentences that exist to be
 * rewritten would put a page's worth of dead rows in `settings` and in `translations` — and every later edit
 * would be a migration. They move to `ui.journey.*` with their fr/de/it/en drafts in the same change that puts
 * these sections on the real home page, once the shape and the words are settled.
 *
 * ARABIC ONLY, for the same reason: the five languages are a requirement of the finished feature, not of a
 * drawing the owner is judging on shape and motion.
 *
 * THE COPY RULE THE BRIEF SETS, which applies to every line here: short, human, no promised yield, no
 * guaranteed profit, no production figures presented as certain. AgriZed is a real farming experience that can
 * be followed and documented — the words never say more than that.
 */

export type Scene = {
  key: string;
  /** The step number as it is drawn, 01…11. */
  no: string;
  title: string;
  /** One sentence. If it does not fit on a phone under the title, it is too long. */
  line: string;
};

export const SCENES: readonly Scene[] = [
  { key: "interest", no: "01", title: "سجّل اهتمامك", line: "تكتب اسمك ونمرتك، وتقوللنا شنوّة تحب. التسجيل مجاني وما يلزمك بالشراء." },
  { key: "offers", no: "02", title: "اختار العرض", line: "تشوف العروض الموجودة فعلاً — بالصور، بالولاية وبالمساحة." },
  { key: "trees", no: "03", title: "اختار قدّاش زيتونة", line: "تحدّد العدد اللي يناسبك، وتشوف السعر والمساحة قبل ما تقرّر." },
  { key: "visit", no: "04", title: "احجز زيارتك", line: "تختار نهار يناسبك باش تمشي تشوف الأرض بعينيك." },
  { key: "land", no: "05", title: "زور الأرض", line: "تمشي للأرض مع الفريق، تشوف الزيتون والموقع قبل أي التزام." },
  { key: "deposit", no: "06", title: "خلّص العربون", line: "تثبّت اختيارك، والزيتونات اللي اخترتها تتحجز باسمك." },
  { key: "contract", no: "07", title: "امضي العقد", line: "عقد مكتوب يسمّي الزيتونات، المساحة والالتزامات. نسخة تبقى عندك." },
  { key: "paying", no: "08", title: "تابع الخلاص", line: "بالحاضر ولا بأقساط شهرية. كل دفعة مسجّلة وتشوفها وقتلي تحب." },
  { key: "follow", no: "09", title: "تابع مشروعك", line: "من حسابك: الزيتونات، الصور، حالة الأرض والأشغال اللي صارت." },
  { key: "harvest", no: "10", title: "الجني والعصر", line: "وقت الجني، الزيتون يتجنى ويمشي للمعصرة — وإنت تتابع." },
  { key: "oil", no: "11", title: "زيتك يوصلك", line: "زيت من زيتونك إنت، بالاسم، في آخر الموسم." },
];

/** The section around the phone. */
export const DEMO = {
  eyebrow: "رحلتك مع AgriZed",
  title: "من التسجيل حتى قارورة الزيت",
  lead: "هاذي الرحلة كاملة، خطوة بخطوة. شوفها قبل ما تبدا.",
  primaryCta: "ابدأ رحلتك مع AgriZed",
  offersCta: "اكتشف العروض",
  interestCta: "سجّل اهتمامك",
  play: "شغّل",
  pause: "وقّف",
  next: "اللي بعدو",
  previous: "اللي قبلو",
  stepOf: "المرحلة {step} من {total}",
  progressLabel: "التقدّم في عرض الرحلة",
};

/** Section 2 — the whole business model in under ten seconds. */
export const HOW = {
  title: "كيفاش تخدم AgriZed؟",
  steps: [
    { key: "pick-offer", label: "اختار العرض" },
    { key: "pick-trees", label: "اختار مشروعك" },
    { key: "visit", label: "زور الأرض" },
    { key: "confirm", label: "ثبّت اختيارك" },
    { key: "contract", label: "اعمل العقد" },
    { key: "follow", label: "تابع مشروعك" },
    { key: "oil", label: "استلم زيتك" },
  ],
};

/** Section 4 — answered before anybody has to ask. */
export const TRUST = {
  title: "شنوّة بالضبط باش يكون عندي؟",
  lead: "كل سؤال يجي في بالك قبل ما تبدا، وجوابو في سطر.",
  items: [
    { key: "what", icon: "tree", q: "شنوّة ناخذ بالضبط؟", a: "زيتونات مرقّمة باسمك، كل وحدة بمساحتها من الأرض." },
    { key: "where", icon: "pin", q: "وين موجود المشروع؟", a: "أرض معروفة بولايتها ومعتمديتها، وتنجم تزورها قبل." },
    { key: "which", icon: "tag", q: "كيفاش نعرف زيتوناتي؟", a: "كل زيتونة عندها رقم خاصّ بيها في العرض، مكتوب في العقد." },
    { key: "papers", icon: "doc", q: "شنوّة الوثائق؟", a: "وثائق الأرض وعقدك إنت — الزوز تشوفهم قبل الإمضاء." },
    { key: "contract", icon: "pen", q: "شنوّة العقد؟", a: "عقد يسمّي الزيتونات والمساحة والالتزامات، ونسخة تبقى عندك." },
    { key: "pay", icon: "wallet", q: "كيفاش يتم الخلاص؟", a: "بالحاضر ولا بأقساط شهرية حسب العرض. كل دفعة مسجّلة." },
    { key: "follow", icon: "screen", q: "كيفاش نتابع؟", a: "من حسابك: الصور، حالة الأرض والأشغال اللي صارت." },
    { key: "visit", icon: "calendar", q: "كيفاش تتم الزيارة؟", a: "تختار نهار، والفريق يستنّاك في الأرض." },
    { key: "harvest", icon: "basket", q: "الجني والعصر؟", a: "الزيتون يتجنى في وقتو ويمشي للمعصرة، والمراحل تتصوّر." },
    { key: "oil", icon: "bottle", q: "كيفاش يوصلني الزيت؟", a: "في آخر الموسم، زيت من زيتونك، ونتفاهمو على التوصيل." },
  ],
};

/** Section 5 — one person, all the way through, so the model is seen and not explained. */
export const EXAMPLE = {
  eyebrow: "مثال",
  title: "محمد اختار مشروع في صفاقس",
  lead: "مثال توضيحي. الأرقام متاع عرض حقيقي موجود في الموقع.",
  note: "محمد شخصية توضيحية — الأرض والأرقام عرض حقيقي.",
  startCta: "ابدأ رحلتك",
  steps: [
    { key: "offer", label: "اختار العرض", detail: "عرض في صفاقس" },
    { key: "count", label: "اختار العدد", detail: "عشر زيتونات" },
    { key: "book", label: "حجز زيارة", detail: "نهار سبت" },
    { key: "visited", label: "زار الأرض", detail: "شاف الزيتون والموقع" },
    { key: "deposit", label: "خلّص العربون", detail: "الزيتونات تحجزت باسمو" },
    { key: "contract", label: "أمضى العقد", detail: "بالأرقام متاع زيتوناتو" },
    { key: "follow", label: "تابع المشروع", detail: "من حسابو، بالصور" },
    { key: "harvest", label: "تابع الجني", detail: "الزيتون مشى للمعصرة" },
    { key: "oil", label: "استلم زيتو", detail: "في آخر الموسم" },
  ],
};
