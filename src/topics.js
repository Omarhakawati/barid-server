// ─────────────────────────────────────────────────────────────
//  بريد — Topic Taxonomy
//  Used to cluster articles into meaningful groups.
//  Keywords: Arabic + English for cross-language matching.
//  contextExclude: if these keywords dominate, zero out this topic
//  (prevents e.g. a sports article about "كأس القدس" scoring Palestine)
// ─────────────────────────────────────────────────────────────

const TOPICS = [
  {
    id:        'palestine',
    nameAr:    'فلسطين وغزة',
    keywords:  [
      // Core conflict terms
      'غزة','فلسطين','حماس','الاحتلال','رفح','نابلس','القدس','الضفة الغربية',
      'قطاع غزة','مسجد الأقصى','جيش الاحتلال','قصف غزة','شهداء غزة',
      'اقتحام الأقصى','مستوطن','أسرى فلسطين','انتفاضة','نتنياهو','وقف إطلاق النار',
      'المقاومة الفلسطينية','الجيش الإسرائيلي','غارة على غزة','ضحايا غزة',
      // English
      'gaza','hamas','west bank','rafah','idf','netanyahu','ceasefire',
      'hostage','occupation','al-aqsa','palestin',
    ],
    // Zero out if article is clearly sports-context despite mentioning القدس/Palestine
    contextExclude: ['مباراة','هدف','دوري','كأس العالم','فيفا','لاعب','استاد','تدريب','انتقال'],
    color:     '#ff6969',
    direction: 'humanitarian',
    weight:    1.4,
  },
  {
    id:        'regional',
    nameAr:    'الشأن الإقليمي',
    keywords:  [
      // Specific regional crises and actors
      'الحوثيون','حزب الله','الحرس الثوري','ميليشيا','الفصائل المسلحة',
      'الوضع في سوريا','الأزمة السودانية','الحرب في اليمن','تقدم القوات في',
      'المشهد اللبناني','الأزمة الليبية','المغرب العربي','القرن الأفريقي',
      'سوريا','اليمن','السودان','ليبيا','الصومال','لبنان','العراق',
      'طهران','بيروت','دمشق','صنعاء','بغداد','الرياض','أبوظبي',
      'الخليج العربي','التوتر الإقليمي','خارطة الطريق','وساطة عربية',
      'مهاجر','لاجئ','هجرة غير نظامية','غرق مهاجرين','قوارب المهاجرين',
      // English
      'hezbollah','houthi','irgc','militia','lebanese','yemeni','syrian',
      'sudanese','gulf states','arab league',
    ],
    contextExclude: ['مباراة','هدف','دوري','بورصة','أسهم','سوق مالية'],
    color:     '#ff9650',
    direction: 'regional',
    weight:    1.0,
  },
  {
    id:        'international',
    nameAr:    'السياسة الدولية',
    keywords:  [
      // Specific political events and actors
      'ترامب','بايدن','بوتين','زيلينسكي','ماكرون','شولتس',
      'البيت الأبيض','الكرملين','البنتاغون','الناتو','مجلس الأمن',
      'الأمم المتحدة','قمة دولية','محادثات السلام','العقوبات الدولية',
      'الحرب الروسية','الغزو الأوكراني','التوترات الأمريكية الصينية',
      'الكونغرس الأمريكي','المفوضية الأوروبية','حلف شمال الأطلسي',
      'أوكرانيا','روسيا','واشنطن','موسكو','بكين','برلين','باريس',
      'بروكسل','لندن','أنقرة',
      // English
      'trump','biden','putin','zelensky','nato','united nations','g7','g20',
      'sanctions','diplomacy','pentagon','congress','kremlin','whitehouse',
      'ukraine','russia','china','europe',
    ],
    contextExclude: ['مباراة','هدف','دوري','نفط','بورصة','كرة القدم'],
    color:     '#64b4ff',
    direction: 'political',
    weight:    1.0,
  },
  {
    id:        'economy',
    nameAr:    'الاقتصاد',
    keywords:  [
      // Specific economic terms
      'أسعار النفط','برميل النفط','أوبك بلس','سعر الذهب','تضخم الأسعار',
      'الدولار الأمريكي','الاحتياطي الفيدرالي','البنك المركزي','الفائدة الأمريكية',
      'صندوق النقد الدولي','البنك الدولي','الناتج المحلي','الميزانية العامة',
      'سوق الأسهم','البورصة','مؤشر نيكاي','مؤشر داو جونز',
      'الاستثمار الأجنبي','التجارة الدولية','العجز التجاري','الدين العام',
      'نمو اقتصادي','ركود اقتصادي','تراجع الإنتاج','أرباح شركة',
      // English
      'oil price','opec','inflation','interest rate','federal reserve',
      'imf','gdp','trade deficit','stock market','dow jones','nasdaq',
      'recession','economic growth','central bank',
    ],
    contextExclude: ['مباراة','هدف','دوري','كرة','لاعب'],
    color:     '#50dc8c',
    direction: 'economic',
    weight:    1.0,
  },
  {
    id:        'climate',
    nameAr:    'المناخ والبيئة',
    keywords:  [
      // Specific climate terms
      'تغير المناخ','الاحترار العالمي','انبعاثات الكربون','ثاني أكسيد الكربون',
      'مؤتمر كوب','الطاقة المتجددة','الطاقة الشمسية','طاقة الرياح',
      'فيضانات مدمرة','موجة جفاف','حرائق الغابات','الأعاصير المدارية',
      'زلزال بقوة','إعصار','موجة حر قياسية','ارتفاع منسوب البحر',
      'تلوث الهواء','التنوع البيولوجي','انقراض الأنواع',
      // English
      'climate change','global warming','carbon emissions','renewable energy',
      'cop summit','flood','drought','wildfire','hurricane','earthquake',
      'sea level','solar energy','wind power',
    ],
    contextExclude: ['مباراة','هدف','دوري','أسهم','بورصة'],
    color:     '#78c850',
    direction: 'global',
    weight:    0.9,
  },
  {
    id:        'tech',
    nameAr:    'التكنولوجيا',
    keywords:  [
      // Specific tech terms
      'الذكاء الاصطناعي','تشات جي بي تي','نموذج لغوي','روبوت ذكي',
      'شركة أبل','شركة غوغل','مايكروسوفت','ميتا فيسبوك','تيك توك',
      'هاتف آيفون','نظام أندرويد','شريحة إلكترونية','حوسبة سحابية',
      'هجوم إلكتروني','اختراق أمني','برمجيات خبيثة','بيانات مسربة',
      'العملات الرقمية','بيتكوين','تطبيق جديد','منصة رقمية',
      'الميتافيرس','الواقع الافتراضي','سيارة ذاتية القيادة',
      // English
      'artificial intelligence','chatgpt','openai','apple','google','microsoft',
      'meta','tiktok','iphone','android','cybersecurity','bitcoin',
      'blockchain','ai model','tech company','startup','algorithm','data breach',
    ],
    contextExclude: ['مباراة','هدف','دوري','كرة','نفط','غزة'],
    color:     '#a078ff',
    direction: 'global',
    weight:    0.9,
  },
  {
    id:        'sports',
    nameAr:    'الرياضة',
    keywords:  [
      // General sports terms (broad fallbacks)
      'رياضة','كرة القدم','مباراة','هدف','دوري','كأس العالم','بطولة',
      'لاعب','مدرب','نادي','منتخب','ملعب','انتقال','هداف','تسجيل هدف',
      'الأولمبياد','ركلات الترجيح','إصابة رياضية','تنس','فورمولا','سباحة',
      // Specific clubs and leagues
      'الدوري الإسباني','الدوري الإنجليزي','دوري أبطال أوروبا',
      'ريال مدريد','برشلونة','ليفربول','مانشستر','باريس سان جيرمان',
      'النصر','الهلال','الأهلي','الزمالك',
      // English
      'football','soccer','match','goal','league','world cup',
      'premier league','la liga','champions league','fifa',
      'real madrid','barcelona','liverpool','manchester',
      'transfer','coach','stadium','olympic','tennis','formula one',
    ],
    contextExclude: [],
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
