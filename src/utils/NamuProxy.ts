export interface NamuPage {
  title: string;
  content: string;
}

const FALLBACK_WORDS = [
  '나무위키', '대한민국', '서울', '컴퓨터', '리그 오브 레전드', '애플', '삼성전자', 
  '유튜브', '구글', 'Wikipedia', '애니메이션', '영화', '축구', '야구', '라면',
  '치킨', '강아지', '고양이', '우주', '과학', '수학', '역사', '철학', '음악'
];

// We pass the raw URL to the proxy functions
const PROXIES = [
  { name: 'CorsProxy.io', fn: (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}` },
  { name: 'AllOrigins-Raw', fn: (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
  { name: 'CodeTabs', fn: (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}` },
  { name: 'Cloudflare-Worker-Proxy', fn: (url: string) => `https://cors-proxy.htmldriven.com/?url=${encodeURIComponent(url)}` }
];

export const fetchNamuPage = async (titleOrUrl: string): Promise<NamuPage> => {
  const isUrl = titleOrUrl.startsWith('http');
  const targetUrl = isUrl ? titleOrUrl : `https://namu.wiki/w/${encodeURIComponent(titleOrUrl)}`;
  
  console.log(`[NamuProxy] Fetching: ${targetUrl}`);

  for (const proxy of PROXIES) {
    try {
      const proxyUrl = proxy.fn(targetUrl);
      console.log(`[NamuProxy] Trying ${proxy.name}...`);
      
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        console.warn(`[NamuProxy] ${proxy.name} failed with status: ${response.status}`);
        continue;
      }

      const html = await response.text();
      if (!html || html.length < 1000) {
        console.warn(`[NamuProxy] ${proxy.name} returned suspicious content (too short)`);
        continue;
      }

      if (html.includes('Checking your browser before accessing') || html.includes('Cloudflare')) {
        console.warn(`[NamuProxy] ${proxy.name} hit Cloudflare protection`);
        continue;
      }

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
          // Extract the page title from the link
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
            } catch (e) { /* ignore encoding errors */ }
          }
        } else if (href && !href.startsWith('#')) {
          link.onclick = (e) => e.preventDefault();
          link.style.opacity = '0.5';
          link.style.cursor = 'not-allowed';
        }
      });

      console.log(`[NamuProxy] Successfully fetched: ${title}`);
      return { title, content: article.innerHTML };
    } catch (err) {
      console.error(`[NamuProxy] Error with ${proxy.name}:`, err);
      continue;
    }
  }

  throw new Error('All proxies failed. Check browser console for details.');
};

export const getRandomNamuPage = async (): Promise<NamuPage> => {
  try {
    return await fetchNamuPage('https://namu.wiki/random');
  } catch (err) {
    console.warn('[NamuProxy] /random failed, using fallback word pool');
    const randomWord = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
    return await fetchNamuPage(randomWord);
  }
};
