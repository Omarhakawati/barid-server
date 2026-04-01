// ─────────────────────────────────────────────────────────────
//  بريد — Topic Taxonomy
//  Used to cluster articles and tweets into meaningful groups.
//  Keywords are Arabic + English for cross-language matching.
// ─────────────────────────────────────────────────────────────

const TOPICS = [
  {
    id:        'palestine',
    nameAr:    'فلسطين وغزة',
    keywords:  ['غزة','فلسطين','حماس','إسرائيل','رفح','نابلس','القدس','الضفة','قطاع','اقتحام','قصف','شهيد','مستوطن','أسرى','محتل','غارة','انتفاضة','مسجد الأقصى','نتنياهو','جيش الاحتلال','gaza','hamas','israel','west bank','rafah','idf','netanyahu','occupation','ceasefire','hostage'],
    color:     '#ff6969',
    direction: 'humanitarian',
    weight:    1.4,
  },
  {
    id:        'regional',
    nameAr:    'الشأن الإقليمي',
    keywords:  ['لبنان','سوريا','اليمن','الحوثي','إيران','العراق','ليبيا','السودان','تونس','المغرب','الأردن','خليج','سعودية','مصر','طهران','بيروت','دمشق','صنعاء','بغداد','الرياض','أبوظبي','قطر','كويت','عمان','البحرين','حزب الله','الحرس الثوري'],
    color:     '#ff9650',
    direction: 'regional',
    weight:    1.0,
  },
  {
    id:        'international',
    nameAr:    'السياسة الدولية',
    keywords:  ['أمريكا','واشنطن','بايدن','ترامب','روسيا','أوكرانيا','الصين','أوروبا','الناتو','الأمم المتحدة','مجلس الأمن','قمة','دبلوماسي','عقوبات','اتفاق','محادثات','بوتين','زيلينسكي','البيت الأبيض','بكين','موسكو','برلين','باريس','بروكسل','biden','trump','russia','ukraine','china','nato','un','summit','sanctions','diplomacy','whitehouse','pentagon'],
    color:     '#64b4ff',
    direction: 'political',
    weight:    1.0,
  },
  {
    id:        'economy',
    nameAr:    'الاقتصاد',
    keywords:  ['اقتصاد','نفط','بترول','أسعار','تضخم','دولار','بنك','استثمار','ميزانية','ديون','تجارة','أسهم','بورصة','ناتج','نمو','فائدة','أوبك','مالية','صندوق النقد','احتياطي','عملة','ركود','انكماش','ازدهار','مصرفي','oil','economy','inflation','dollar','market','trade','bank','gdp','opec','recession','growth','fed','interest rate'],
    color:     '#50dc8c',
    direction: 'economic',
    weight:    1.0,
  },
  {
    id:        'climate',
    nameAr:    'المناخ والبيئة',
    keywords:  ['مناخ','بيئة','كوب','احترار','فيضان','جفاف','طاقة متجددة','انبعاث','كربون','تغير مناخي','زلزال','إعصار','كارثة طبيعية','تلوث','غابات','climate','environment','flood','drought','energy','carbon','cop','renewable','earthquake','hurricane','wildfire','pollution'],
    color:     '#78c850',
    direction: 'global',
    weight:    0.9,
  },
  {
    id:        'tech',
    nameAr:    'التكنولوجيا',
    keywords:  ['ذكاء اصطناعي','تكنولوجيا','تقنية','هاتف','شركة تقنية','ابتكار','رقمي','إنترنت','سيبراني','روبوت','تطبيق','منصة','بيانات','خوارزمية','ai','artificial intelligence','tech','digital','cyber','google','apple','microsoft','openai','chatgpt','robot','startup','algorithm','data','platform'],
    color:     '#a078ff',
    direction: 'global',
    weight:    0.9,
  },
  {
    id:        'sports',
    nameAr:    'الرياضة',
    keywords:  ['كرة القدم','رياضة','فريق','لاعب','بطولة','مباراة','هدف','دوري','كأس','أولمبياد','فيفا','ملعب','تدريب','انتقال','مدرب','نادي','ريال مدريد','برشلونة','ليفربول','مانشستر','football','soccer','sport','league','match','goal','champion','cup','fifa','transfer','coach','stadium'],
    color:     '#ffc840',
    direction: 'neutral',
    weight:    0.7,
  },
];

// Direction → Arabic label + CSS class
const DIRECTIONS = {
  humanitarian: { ar: 'إنساني — تصعيد',      cls: 'dir-h' },
  political:    { ar: 'سياسي — دبلوماسي',     cls: 'dir-p' },
  economic:     { ar: 'اقتصادي — تحليلي',     cls: 'dir-e' },
  regional:     { ar: 'إقليمي — متابعة',      cls: 'dir-g' },
  global:       { ar: 'دولي — متنوع',         cls: 'dir-p' },
  neutral:      { ar: 'متنوع',                cls: 'dir-g' },
};

module.exports = { TOPICS, DIRECTIONS };
