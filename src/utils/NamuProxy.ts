export interface NamuPage {
  title: string;
  content: string;
}

// Fallback word list in case /random is blocked
const FALLBACK_WORDS = [
  '나무위키', '대한민국', '서울', '컴퓨터', '리그 오브 레전드', '애플', '삼성전자', 
  '유튜브', '구글', 'Wikipedia', '애니메이션', '영화', '축구', '야구', '라면',
  '치킨', '강아지', '고양이', '우주', '과학', '수학', '역사', '철학', '음악',
  '아이돌', '방탄소년단', '뉴진스', '손흥민', '페이커', '스타크래프트', '마인크래프트',
  '넷플릭스', '라면', '김치', '불고기', '비빔밥', '제주도', '부산', '도쿄', '뉴욕'
];

const PROXIES = [
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
];

export const fetchNamuPage = async (titleOrUrl: string): Promise<NamuPage> => {
  const isUrl = titleOrUrl.startsWith('http');
  const targetUrl = isUrl ? titleOrUrl : `https://namu.wiki/w/${encodeURIComponent(titleOrUrl)}`;
  
  let lastError = null;

  for (const getProxyUrl of PROXIES) {
    try {
      const proxyUrl = getProxyUrl(targetUrl);
      const response = await fetch(proxyUrl);
      if (!response.ok) continue;

      let html = '';
      if (proxyUrl.includes('allorigins')) {
        const data = await response.json();
        html = data.contents;
      } else {
        html = await response.text();
      }

      if (!html || html.length < 500) continue; // Too short, probably a block page

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Extract title
      const title = doc.querySelector('h1')?.textContent?.trim() || 
                    doc.querySelector('title')?.textContent?.split(' - ')[0]?.trim() || 
                    titleOrUrl;

      // Extract content
      const article = doc.querySelector('article') || 
                      doc.querySelector('.wiki-content') || 
                      doc.querySelector('.wiki-inner-content') ||
                      doc.body;

      // Clean up
      const elementsToRemove = article.querySelectorAll('script, style, iframe, .wiki-ads, .wiki-edit-section, footer, nav');
      elementsToRemove.forEach(el => el.remove());

      // Rewrite links
      const links = article.querySelectorAll('a');
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && (href.startsWith('/w/') || href.startsWith('https://namu.wiki/w/'))) {
          const pageName = href.split('/w/')[1]?.split('?')[0];
          if (pageName) {
            link.setAttribute('href', '#');
            link.setAttribute('data-page', decodeURIComponent(pageName));
            link.style.color = '#3b82f6';
            link.style.textDecoration = 'underline';
            link.style.cursor = 'pointer';
          }
        } else if (href && !href.startsWith('#')) {
          link.onclick = (e) => e.preventDefault();
          link.style.opacity = '0.5';
          link.style.cursor = 'not-allowed';
        }
      });

      return {
        title,
        content: article.innerHTML
      };
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  throw lastError || new Error('All proxies failed to fetch Namuwiki content');
};

export const getRandomNamuPage = async (): Promise<NamuPage> => {
  try {
    // Try real random first
    return await fetchNamuPage('https://namu.wiki/random');
  } catch (err) {
    console.warn('Real /random failed, using fallback word pool');
    const randomWord = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
    return await fetchNamuPage(randomWord);
  }
};
