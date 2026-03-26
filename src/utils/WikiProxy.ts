export interface WikiPage {
  title: string;
  content: string;
}

const WIKI_API_URL = 'https://ko.wikipedia.org/w/api.php';

export const fetchWikiPage = async (title: string): Promise<WikiPage> => {
  const params = new URLSearchParams({
    action: 'parse',
    page: title,
    format: 'json',
    origin: '*',
    prop: 'text|displaytitle',
    disableeditsection: 'true'
  });

  try {
    const response = await fetch(`${WIKI_API_URL}?${params.toString()}`);
    if (!response.ok) throw new Error('Wikipedia API request failed');
    
    const data = await response.json();
    if (data.error) throw new Error(data.error.info);

    const rawHtml = data.parse.text['*'];
    
    const titleParser = new DOMParser();
    const titleDoc = titleParser.parseFromString(data.parse.displaytitle, 'text/html');
    const displayTitle = titleDoc.body.textContent || data.parse.displaytitle;

    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    const container = doc.body;

    const toRemove = container.querySelectorAll('.mw-editsection, .reference, .reflist, .navbox, .infobox, .sidenote, .metadata, .mw-empty-elt');
    toRemove.forEach(el => el.remove());

    const links = container.querySelectorAll('a');
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && (href.includes('/wiki/') || href.startsWith('./')) && !href.includes(':')) {
        let pageName = '';
        if (href.startsWith('./')) {
          pageName = href.replace('./', '');
        } else {
          const parts = href.split('/wiki/');
          pageName = parts[parts.length - 1].split('#')[0];
        }

        if (pageName) {
          link.setAttribute('href', '#');
          link.setAttribute('data-page', decodeURIComponent(pageName).replace(/_/g, ' '));
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

/**
 * Checks if a title is "Simple": 
 * 1. No whitespace (Single word)
 * 2. No numbers or special symbols (Koreans/Alphabets only)
 */
const isSimpleTitle = (title: string): boolean => {
  // 1. No whitespace
  if (/\s/.test(title)) return false;
  
  // 2. No numbers or symbols like ()[],. etc.
  // We allow only Korean characters (가-힣) and English Alphabets (a-zA-Z)
  const regex = /^[가-힣a-zA-Z]+$/;
  return regex.test(title);
};

/**
 * Fetches page views for the last 30 days
 */
const getPageViews = async (title: string): Promise<number> => {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'pageviews',
    titles: title,
    format: 'json',
    origin: '*'
  });

  try {
    const response = await fetch(`${WIKI_API_URL}?${params.toString()}`);
    const data = await response.json();
    const pages = data.query.pages;
    const pageId = Object.keys(pages)[0];
    const viewsObj = pages[pageId].pageviews || {};
    
    // Sum views in the returned object
    const totalViews = Object.values(viewsObj).reduce((sum: number, val: any) => sum + (val || 0), 0);
    return totalViews as number;
  } catch (e) {
    return 0;
  }
};

export const getRandomWikiPage = async (criteria: 'any' | 'simple_popular' = 'any'): Promise<WikiPage> => {
  // To optimize, we fetch multiple random titles at once
  const fetchRandomTitles = async (limit: number = 10) => {
    const params = new URLSearchParams({
      action: 'query',
      list: 'random',
      rnnamespace: '0',
      rnlimit: limit.toString(),
      format: 'json',
      origin: '*'
    });
    const response = await fetch(`${WIKI_API_URL}?${params.toString()}`);
    const data = await response.json();
    return data.query.random.map((p: any) => p.title);
  };

  if (criteria === 'any') {
    const titles = await fetchRandomTitles(1);
    return fetchWikiPage(titles[0]);
  }

  // Filter loop for simple_popular
  let attempts = 0;
  while (attempts < 50) { // Limit attempts to avoid infinite loops
    attempts++;
    const titles = await fetchRandomTitles(10);
    
    for (const title of titles) {
      if (isSimpleTitle(title)) {
        const views = await getPageViews(title);
        if (views >= 300) {
          console.log(`[WikiProxy] Selected target: ${title} (${views} views)`);
          return fetchWikiPage(title);
        }
      }
    }
  }

  // Absolute fallback if we can't find anything in 50 attempts
  return fetchWikiPage('대한민국');
};
