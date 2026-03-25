export interface WikiPage {
  title: string;
  content: string;
}

const WIKI_API_URL = 'https://ko.wikipedia.org/w/api.php';

export const fetchWikiPage = async (title: string): Promise<WikiPage> => {
  console.log(`[WikiProxy] Fetching: ${title}`);
  
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
    
    // Clean up title (remove HTML tags like <span class="mw-page-title-main">)
    const titleParser = new DOMParser();
    const titleDoc = titleParser.parseFromString(data.parse.displaytitle, 'text/html');
    const displayTitle = titleDoc.body.textContent || data.parse.displaytitle;

    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    const container = doc.body;

    // Clean up
    const toRemove = container.querySelectorAll('.mw-editsection, .reference, .reflist, .navbox, .infobox, .sidenote, .metadata, .mw-empty-elt');
    toRemove.forEach(el => el.remove());

    // Rewrite internal Wikipedia links
    const links = container.querySelectorAll('a');
    links.forEach(link => {
      const href = link.getAttribute('href');
      
      // Robust check for Wikipedia internal links
      // Matches /wiki/Page, ./Page, or full URL
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

    // Fix images
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


