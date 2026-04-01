const CHANNELS = [
  {
    id:          'ajabreaking',
    nameAr:      'الجزيرة عاجل',
    label:       'عاجل',
    // Try multiple Arabic RSS paths - aljazeera.net is Arabic, aljazeera.com is English
    rss:         'https://www.aljazeera.net/rss',
    rssFallback: 'https://www.aljazeera.net/feed',
    rssLang:     'ar',   // reject feed if articles come back in English
    xHandle:     'AJABreaking',
    xUserId:     '143677916',
  },
  {
    id:       'bbc',
    nameAr:   'BBC عربي',
    label:    'BBC',
    rss:      'https://feeds.bbci.co.uk/arabic/rss.xml',
    xHandle:  'BBCArabic',
    xUserId:  '60719440',
  },
  {
    id:       'cnn',
    nameAr:   'CNN بالعربية',
    label:    'CNN',
    rss:      'https://arabic.cnn.com/api/v1/rss/rss.xml',
    xHandle:  'cnnarabic',
    xUserId:  '16956018',
  },
  {
    id:          'sky',
    nameAr:      'سكاي نيوز عربية',
    label:       'SKY',
    rss:         'https://www.skynewsarabia.com/web/rss',
    rssFallback: 'https://www.skynewsarabia.com/rss.xml',
    xHandle:     'SkyNewsArabia',
    xUserId:     '168671490',
  },
  {
    id:       'france24',
    nameAr:   'فرانس ٢٤',
    label:    'F24',
    rss:      'https://www.france24.com/ar/rss',
    xHandle:  'France24_ar',
    xUserId:  '267521788',
  },
  {
    id:       'dw',
    nameAr:   'DW عربية',
    label:    'DW',
    rss:      'https://rss.dw.com/xml/rss-ar-all',
    xHandle:  'dw_arabic',
    xUserId:  '213976667',
  },
  {
    id:       'rtarabic',
    nameAr:   'روسيا اليوم',
    label:    'RT',
    rss:      'https://arabic.rt.com/rss/',
    xHandle:  'RTarabic',
    xUserId:  '73418212',
  },
  {
    id:       'alarabiya',
    nameAr:   'العربية',
    label:    'العربية',
    rss:      'https://news.google.com/rss/search?q=site:alarabiya.net&hl=ar&gl=SA&ceid=SA:ar',
    rssFallback: 'https://news.google.com/rss/search?q=alarabiya.net&hl=ar&gl=SA&ceid=SA:ar',
    xHandle:  'AlArabiya',
    xUserId:  '57852680',
  },
];

module.exports = CHANNELS;
