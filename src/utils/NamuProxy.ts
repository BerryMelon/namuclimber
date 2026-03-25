export interface NamuPage {
  title: string;
  content: string;
}

export const FALLBACK_WORDS = [
  '나무위키', '대한민국', '서울', '컴퓨터', '리그 오브 레전드', '애플', '삼성전자', 
  '유튜브', '구글', '애니메이션', '영화', '축구', '야구', '라면', '치킨', '강아지', '고양이', 
  '우주', '과학', '역사', '철학', '음악', '손흥민', '페이커', '어벤져스', '포켓몬스터',
  '디지몬', '슬램덩크', '원피스(만화)', '드래곤볼', '신세기 에반게리온', '진격의 거인',
  '귀멸의 칼날', '스즈메의 문단속', '너의 이름은.', '기생충(영화)', '오징어 게임',
  '더 글로리', '이상한 변호사 우영우', '무한도전', '런닝맨', '1박 2일', '나 혼자 산다'
];

const PROXIES = [
  { name: 'CorsProxy.io', fn: (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}` },
  { name: 'AllOrigins-Raw', fn: (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
  { name: 'CodeTabs', fn: (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}` }
];

export const fetchNamuPage = async (titleOrUrl: string): Promise<NamuPage> => {
  const isUrl = titleOrUrl.startsWith('http');
  const targetUrl = isUrl ? titleOrUrl : `https://namu.wiki/w/${encodeURIComponent(titleOrUrl)}`;
  
  for (const proxy of PROXIES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    try {
      const proxyUrl = proxy.fn(targetUrl);
      const response = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) continue;

      const html = await response.text();
      if (!html || html.length < 500) continue;

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const title = doc.querySelector('h1')?.textContent?.trim() || 
                    doc.querySelector('title')?.textContent?.split(' - ')[0]?.trim() || 
                    titleOrUrl;

      const article = doc.querySelector('article') || 
                      doc.querySelector('.wiki-content') || 
                      doc.querySelector('.wiki-inner-content') ||
                      doc.body;

      // Clean up
      const elementsToRemove = article.querySelectorAll('script, style, iframe, .wiki-ads, .wiki-edit-section, footer, nav, aside');
      elementsToRemove.forEach(el => el.remove());

      // Rewrite links
      const links = article.querySelectorAll('a');
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && (href.startsWith('/w/') || href.startsWith('https://namu.wiki/w/'))) {
          const parts = href.split('/w/');
          const pagePath = parts[parts.length - 1].split('?')[0].split('#')[0];
          if (pagePath) {
            try {
              const decoded = decodeURIComponent(pagePath);
              link.setAttribute('href', '#');
              link.setAttribute('data-page', decoded);
              link.style.color = '#3b82f6';
              link.style.textDecoration = 'underline';
              link.style.cursor = 'pointer';
            } catch (e) {}
          }
        } else if (href && !href.startsWith('#')) {
          link.onclick = (e) => e.preventDefault();
          link.style.opacity = '0.5';
          link.style.cursor = 'not-allowed';
        }
      });

      // Constrain images
      const images = article.querySelectorAll('img, svg');
      images.forEach(img => {
        (img as HTMLElement).style.maxWidth = '100%';
        (img as HTMLElement).style.height = 'auto';
        (img as HTMLElement).style.display = 'block';
        (img as HTMLElement).style.margin = '1rem auto';
      });

      return { title, content: article.innerHTML };
    } catch (err) {
      clearTimeout(timeoutId);
      continue;
    }
  }

  throw new Error('All proxies failed.');
};

export const getRandomNamuPage = async (): Promise<NamuPage> => {
  try {
    return await fetchNamuPage('https://namu.wiki/random');
  } catch (err) {
    const randomWord = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
    return await fetchNamuPage(randomWord);
  }
};
