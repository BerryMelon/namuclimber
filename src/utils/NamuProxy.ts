export interface NamuPage {
  title: string;
  content: string;
}

export const fetchNamuPage = async (titleOrUrl: string): Promise<NamuPage> => {
  const isUrl = titleOrUrl.startsWith('http');
  const url = isUrl ? titleOrUrl : `https://namu.wiki/w/${encodeURIComponent(titleOrUrl)}`;
  
  // Using corsproxy.io as it often handles Cloudflare-protected sites better
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
  
  try {
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Proxy returned status: ${response.status}`);
    
    const html = await response.text();
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Namuwiki's title is often in the <title> or <h1>
    const title = doc.querySelector('h1')?.textContent || doc.querySelector('title')?.textContent?.split(' - ')[0] || titleOrUrl;
    
    // Namuwiki's content structure can vary, we target the main article body
    // The most common class is 'wiki-article' or 'v-flex' containers
    const article = doc.querySelector('article') || 
                    doc.querySelector('.wiki-content') || 
                    doc.querySelector('.wiki-inner-content');
    
    if (!article) {
      console.warn('Could not find standard article tag, attempting fallback to body');
      // If we can't find the article, we might have hit a CAPTCHA or a different layout
      if (html.includes('cloudflare') || html.includes('captcha')) {
        throw new Error('Namuwiki blocked the request (Cloudflare/Captcha)');
      }
    }

    const finalArticle = article || doc.body;

    // Clean up unwanted elements
    const elementsToRemove = finalArticle.querySelectorAll('script, style, iframe, .wiki-ads, .wiki-edit-section');
    elementsToRemove.forEach(el => el.remove());

    // Rewrite links
    const links = finalArticle.querySelectorAll('a');
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && (href.startsWith('/w/') || href.startsWith('https://namu.wiki/w/'))) {
        const pageName = href.split('/w/')[1];
        if (pageName) {
          link.setAttribute('href', '#');
          link.setAttribute('data-page', decodeURIComponent(pageName));
          link.style.color = '#3b82f6'; // tailwind blue-500
          link.style.textDecoration = 'underline';
          link.style.cursor = 'pointer';
        }
      } else if (href && !href.startsWith('#')) {
        // Disable external links or links that are not wiki pages for the game
        link.onclick = (e) => e.preventDefault();
        link.style.opacity = '0.5';
        link.style.cursor = 'not-allowed';
      }
    });

    return {
      title,
      content: finalArticle.innerHTML
    };
  } catch (error) {
    console.error('Error fetching Namuwiki page:', error);
    throw error;
  }
};

export const getRandomNamuPage = async (): Promise<NamuPage> => {
  return fetchNamuPage('https://namu.wiki/random');
};
