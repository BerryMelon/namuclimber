export interface WikiPage {
  title: string;
  content: string;
}

const WIKI_API_URL = 'https://ko.wikipedia.org/w/api.php';

export const fetchWikiPage = async (title: string): Promise<WikiPage> => {
  // 1. Fetch the page content from Wikipedia API
  const params = new URLSearchParams({
    action: 'parse',
    page: title,
    format: 'json',
    origin: '*', // Required for CORS
    prop: 'text|displaytitle',
    disableeditsection: 'true',
    mobileformat: 'true'
  });

  try {
    const response = await fetch(`${WIKI_API_URL}?${params.toString()}`);
    if (!response.ok) throw new Error('Wikipedia API request failed');
    
    const data = await response.json();
    if (data.error) throw new Error(data.error.info);

    const rawHtml = data.parse.text['*'];
    const displayTitle = data.parse.displaytitle;

    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    const container = doc.body;

    // Clean up unwanted Wikipedia elements (references, edit links, etc.)
    const toRemove = container.querySelectorAll('.mw-editsection, .reference, .reflist, .navbox, .infobox, .sidenote, .metadata');
    toRemove.forEach(el => el.remove());

    // Rewrite internal Wikipedia links
    const links = container.querySelectorAll('a');
    links.forEach(link => {
      const href = link.getAttribute('href');
      // Wikipedia internal links look like /wiki/Page_Name
      if (href && href.startsWith('/wiki/') && !href.includes(':')) {
        const pageName = href.replace('/wiki/', '');
        link.setAttribute('href', '#');
        link.setAttribute('data-page', decodeURIComponent(pageName).replace(/_/g, ' '));
        link.style.color = '#3b82f6';
        link.style.textDecoration = 'underline';
      } else if (href && !href.startsWith('#')) {
        // Disable external links
        link.onclick = (e) => e.preventDefault();
        link.style.opacity = '0.5';
        link.style.cursor = 'not-allowed';
      }
    });

    // Fix image paths (Wikipedia uses relative protocol //upload...)
    const images = container.querySelectorAll('img');
    images.forEach(img => {
      let src = img.getAttribute('src');
      if (src && src.startsWith('//')) {
        img.setAttribute('src', `https:${src}`);
      }
      (img as HTMLElement).style.maxWidth = '100%';
      (img as HTMLElement).style.height = 'auto';
    });

    return {
      title: displayTitle,
      content: container.innerHTML
    };
  } catch (error) {
    console.error('Error fetching Wikipedia page:', error);
    throw error;
  }
};

export const getRandomWikiPage = async (): Promise<WikiPage> => {
  // Fetch a random page title first
  const params = new URLSearchParams({
    action: 'query',
    list: 'random',
    rnnamespace: '0',
    rnlimit: '1',
    format: 'json',
    origin: '*'
  });

  const response = await fetch(`${WIKI_API_URL}?${params.toString()}`);
  const data = await response.json();
  const randomTitle = data.query.random[0].title;
  
  return fetchWikiPage(randomTitle);
};

export const FALLBACK_WORDS = [
  '대한민국', '서울', '컴퓨터', '애플', '삼성전자', '유튜브', '구글', '축구', '야구', 
  '우주', '과학', '역사', '철학', '음악', '손흥민', '방탄소년단', '김구', '세종대왕',
  '이순신', '제주도', '한라산', '한강', '경복궁', '김치', '비빔밥', '불고기'
];
