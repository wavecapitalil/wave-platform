/* Wave Capital — shared EN/HE toggle.
 * Usage:
 *   - Static text: <span data-i18n="nav.home">Home</span>
 *   - Placeholder/title attrs: <input data-i18n-placeholder="search.ph" placeholder="Search...">
 *   - Dynamic JS strings: t('nav.home') -> returns the string in the current
 *     language, falling back to the English default (2nd arg) if the key
 *     isn't in the dictionary yet, so untranslated areas degrade gracefully
 *     to English instead of breaking.
 *   - RTL: applyLang() sets <html lang dir> automatically for 'he'.
 *
 * The dictionary is intentionally partial and grows over time — call
 * t(key, fallbackEnglishText) everywhere so missing keys never show
 * "undefined" or blank text.
 */
(function(global){
  var DICT = {
    'nav.home':        {en:'Home',            he:'בית'},
    'nav.terminal':    {en:'Terminal',        he:'טרמינל'},
    'nav.blog':        {en:'Blog',            he:'בלוג'},
    'nav.products':    {en:'Products',        he:'מוצרים'},
    'nav.enter':       {en:'Enter Terminal',  he:'כניסה לטרמינל'},

    'home.tag':        {en:'Follow the Next Wave', he:'עקבו אחרי הגל הבא'},
    'home.cta':        {en:'Enter Terminal',  he:'כניסה לטרמינל'},

    'blog.tag':        {en:'Research & Insights', he:'מחקר ותובנות'},
    'blog.title':      {en:'Blog',            he:'בלוג'},
    'blog.sub':        {en:'Market analysis, strategy breakdowns, and trade recaps.', he:'ניתוח שוק, פירוק אסטרטגיות וסיכומי מסחר.'},
    'blog.empty':      {en:'No articles yet — check back soon.', he:'עדיין אין כתבות — נסו שוב בקרוב.'},
    'blog.loading':    {en:'Loading articles…', he:'טוען כתבות…'},
    'blog.back':       {en:'Back to Blog',     he:'חזרה לבלוג'},
    'blog.aiNotice':   {en:'AI-generated — verify against the original source before acting.', he:'נכתב על ידי AI — יש לאמת מול המקור המקורי לפני קבלת החלטות.'},
    'blog.readMore':   {en:'Read more',        he:'קרא עוד'},
    'blog.source':     {en:'Source',           he:'מקור'},

    'products.tag':    {en:'Tools & Systems', he:'כלים ומערכות'},
    'products.title':  {en:'Products',         he:'מוצרים'},
    'products.sub':    {en:'Quantitative tools built for serious traders.', he:'כלים כמותיים שנבנו עבור סוחרים רציניים.'},
    'products.soon':   {en:'Coming Soon',      he:'בקרוב'},
    'products.soonSub':{en:'Backtest Suite, Strategy Analyzer, and more — in development.', he:'חבילת בקטסט, מנתח אסטרטגיות ועוד — בפיתוח.'},

    'footer.copy':     {en:'© 2026 Wave Capital', he:'© 2026 Wave Capital'},

    'sidebar.overview':   {en:'Overview',        he:'סקירה'},
    'sidebar.home':       {en:'Home',            he:'בית'},
    'sidebar.brief':      {en:'Morning Brief',   he:'תדריך בוקר'},
    'sidebar.macro':      {en:'Macro',           he:'מאקרו'},
    'sidebar.riskMeter':  {en:'Risk Meter',      he:'מד סיכון'},
    'sidebar.macroScanner': {en:'Macro Scanner', he:'סורק מאקרו'},
    'sidebar.fx':         {en:'FX Monitor',      he:'מוניטור מט"ח'},
    'sidebar.rates':      {en:'Rates & Yields',  he:'ריביות ותשואות'},
    'sidebar.commodities':{en:'Commodities',     he:'סחורות'},
    'sidebar.hormuz':     {en:'Hormuz Oil Desk', he:'דסק נפט הורמוז'},
    'sidebar.btcgold':    {en:'BTC / Gold Ratio',he:'יחס ביטקוין/זהב'},
    'sidebar.pcr':        {en:'Put/Call Ratio',  he:'יחס Put/Call'},
    'sidebar.housing':    {en:'Housing Risk Gauge', he:'מד סיכון דיור'},
    'sidebar.seasonality':{en:'Seasonality Scanner', he:'סורק עונתיות'},
    'sidebar.equities':   {en:'Equities',        he:'מניות'},
    'sidebar.sectorStrength': {en:'Sector Strength', he:'עוצמת סקטורים'},
    'sidebar.marketBreadth':  {en:'Market Breadth', he:'רוחב שוק'},
    'sidebar.companyResearch':{en:'Company Research', he:'מחקר חברות'},
    'sidebar.whatsMoving':{en:"What's Moving",  he:'מה זז'},
    'sidebar.institutions':{en:'Institutional Holdings', he:'אחזקות מוסדיות'},
    'sidebar.fundChart':  {en:'Fundamental Chart', he:'גרף פונדמנטלי'},
    'sidebar.insider':    {en:'Insider Buying', he:'קניות פנים'},
    'sidebar.earnings':   {en:'Earnings',       he:'דוחות'},
    'sidebar.correlation':{en:'Correlation',    he:'מתאם'},
    'sidebar.industries': {en:'Industries',     he:'ענפים'},
    'sidebar.commFlows':  {en:'Comm. Flows',    he:'תזרים תקשורת'},
    'sidebar.ev':         {en:'EV Industry',    he:'תעשיית רכב חשמלי'},
    'sidebar.crypto':     {en:'Crypto',         he:'קריפטו'},
    'sidebar.cryptoDash': {en:'Crypto Dashboard', he:'לוח בקרה קריפטו'},
    'sidebar.cryptoScanner': {en:'Crypto Scanner', he:'סורק קריפטו'},
    'sidebar.tools':      {en:'Tools',          he:'כלים'},
    'sidebar.backtest':   {en:'Backtest Suite', he:'חבילת בקטסט'},
    'sidebar.tradeIdeas': {en:'Trade Ideas',    he:'רעיונות מסחר'},
    'sidebar.soon':       {en:'Soon',           he:'בקרוב'},
    'sidebar.live':       {en:'Live',           he:'חי'},
    'sidebar.ai':         {en:'AI',             he:'AI'},
    'sidebar.secOverview':{en:'OVERVIEW',       he:'סקירה'},
    'sidebar.secMacro':   {en:'MACRO',          he:'מאקרו'},
    'sidebar.secEquities':{en:'EQUITIES',       he:'מניות'},
    'sidebar.secCrypto':  {en:'CRYPTO',         he:'קריפטו'},
    'sidebar.secTools':   {en:'TOOLS',          he:'כלים'},

    'home.greetingMorning': {en:'Good morning',   he:'בוקר טוב'},
    'home.greetingAfternoon': {en:'Good afternoon', he:'צהריים טובים'},
    'home.greetingEvening': {en:'Good evening',   he:'ערב טוב'},
    'home.regime':        {en:'Market Regime',   he:'משטר שוק'},
    'home.marketsIntel':  {en:'Markets Intelligence', he:'מודיעין שוקים'},
    'home.fullBrief':     {en:'Full Brief →',    he:'תדריך מלא ←'},
    'home.calendar':      {en:"📅 Today's Calendar", he:'📅 לוח שנה להיום'},
    'home.sectorPulse':   {en:'📊 Sector Pulse', he:'📊 דופק סקטורים'},
    'home.seeAll':        {en:'See all →',       he:'הצג הכל ←'},

    'hero.title':      {en:'Wave Capital',    he:'Wave Capital'},
    'hero.subtitle':   {en:'Follow the Next Wave', he:'עקבו אחרי הגל הבא'},
    'hero.enter':      {en:'Enter Terminal',  he:'כניסה לטרמינל'},
    'hero.viewProducts':{en:'View Products',  he:'צפו במוצרים'},
    'hero.scroll':     {en:'Scroll',          he:'גלול'},

    'stats.brief':     {en:'Daily Brief — Israel Time', he:'תדריך יומי — שעון ישראל'},
    'stats.assets':    {en:'Asset Classes Tracked', he:'סוגי נכסים במעקב'},
    'stats.ai':        {en:'Claude-Powered Analysis', he:'ניתוח מבוסס Claude'},
    'stats.monte':     {en:'Monte Carlo Simulations', he:'סימולציות מונטה קרלו'},

    'features.tag':    {en:'Platform',        he:'הפלטפורמה'},
    'features.title':  {en:'Everything a trader needs. In one place.', he:'כל מה שסוחר צריך. במקום אחד.'},
    'features.sub':    {en:"Wave Capital combines real-time market intelligence, AI-powered analysis, and quantitative backtesting into a unified system.", he:'Wave Capital משלבת מודיעין שוק בזמן אמת, ניתוח מבוסס AI ובקטסטינג כמותי למערכת אחת.'},
    'features.live':   {en:'Live',            he:'חי'},
    'features.new':    {en:'New',             he:'חדש'},
    'features.soon':   {en:'Coming Soon',     he:'בקרוב'},
    'features.terminalTitle': {en:'Morning Terminal', he:'טרמינל הבוקר'},
    'features.terminalDesc':  {en:'Daily AI-generated market briefing. Regime detection, top drivers, options flow, economic calendar, and trading bias — delivered every morning at 08:00.', he:'תדריך שוק יומי שנכתב על ידי AI. זיהוי משטר שוק, גורמים מובילים, תזרים אופציות, לוח שנה כלכלי והטיית מסחר — כל בוקר ב-08:00.'},
    'features.terminalLink':  {en:'Enter Terminal', he:'כניסה לטרמינל'},
    'features.blogTitle':     {en:'Research & Blog', he:'מחקר ובלוג'},
    'features.blogDesc':      {en:"Deep-dive market analysis, strategy breakdowns, and trade recaps. Macro themes explained with a trader's perspective.", he:'ניתוח שוק מעמיק, פירוק אסטרטגיות וסיכומי מסחר. נושאי מאקרו מוסברים מנקודת מבטו של סוחר.'},
    'features.blogLink':      {en:'Read Blog',  he:'קריאת הבלוג'},
    'features.backtestTitle': {en:'Backtest Suite', he:'חבילת בקטסט'},
    'features.backtestDesc':  {en:'Upload your 4H strategy data and get instant performance analytics — win rate, drawdown, Monte Carlo simulation, and S/D zone breakdown.', he:'העלו נתוני אסטרטגיה ל-4 שעות וקבלו ניתוח ביצועים מיידי — אחוז הצלחה, ירידה מקסימלית, סימולציית מונטה קרלו ופילוח אזורי היצע/ביקוש.'},
    'features.backtestLink':  {en:'View Products', he:'צפו במוצרים'},

    'tp.tag':          {en:'Morning Terminal', he:'טרמינל הבוקר'},
    'tp.title':        {en:'Know your regime before the market opens.', he:'הכירו את משטר השוק לפני הפתיחה.'},
    'tp.sub':          {en:'Every morning at 08:00 Israel time, the system fetches live market data, runs it through a multi-factor risk engine, and sends it to Claude for structured analysis.', he:'כל בוקר ב-08:00 שעון ישראל, המערכת שואבת נתוני שוק חיים, מריצה אותם דרך מנוע סיכון רב-גורמי ושולחת אותם ל-Claude לניתוח מובנה.'},
    'tp.openBrief':    {en:"Open Today's Brief →", he:'פתחו את התדריך של היום ←'},
    'tp.barTitle':     {en:'Morning Intelligence — Wave Capital', he:'מודיעין בוקר — Wave Capital'},
    'tp.regime':       {en:'Market Regime',   he:'משטר שוק'},
    'tp.pcr':          {en:'Put/Call Ratio',  he:'יחס Put/Call'},

    'manifesto.quote': {en:'"Markets don\'t reward the busiest trader.<br>They reward the one who understands <strong>what matters today</strong>,<br>ignores the noise, and acts with conviction."',
                         he:'"השוק לא מתגמל את הסוחר העסוק ביותר.<br>הוא מתגמל את מי שמבין <strong>מה חשוב היום</strong>,<br>מתעלם מהרעש ופועל בביטחון."'},
    'manifesto.author':{en:'— Wave Capital Philosophy', he:'— הפילוסופיה של Wave Capital'},
  };

  function getLang(){
    try { return localStorage.getItem('wc_lang') || 'en'; } catch(e){ return 'en'; }
  }

  function t(key, fallback){
    var lang = getLang();
    var entry = DICT[key];
    if(!entry) return fallback !== undefined ? fallback : key;
    return entry[lang] || entry.en || fallback || key;
  }

  function applyLang(){
    var lang = getLang();
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(function(el){
      el.textContent = t(el.getAttribute('data-i18n'), el.textContent);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function(el){
      el.innerHTML = t(el.getAttribute('data-i18n-html'), el.innerHTML);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el){
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'), el.placeholder);
    });
    document.querySelectorAll('.nav-lang').forEach(function(el){
      el.textContent = lang === 'he' ? '🌐 עב' : '🌐 EN';
    });
    if(typeof global.onLangChange === 'function'){
      try { global.onLangChange(lang); } catch(e){}
    }
  }

  function setLang(lang){
    try { localStorage.setItem('wc_lang', lang); } catch(e){}
    applyLang();
  }

  function cycleLang(){
    setLang(getLang() === 'he' ? 'en' : 'he');
  }

  global.t = t;
  global.getLang = getLang;
  global.setLang = setLang;
  global.applyLang = applyLang;
  global.cycleLang = cycleLang;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', applyLang);
  } else {
    applyLang();
  }
})(window);