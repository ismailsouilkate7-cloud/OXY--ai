// ============================================================
// OXY AI — Rich Image Response Components
// ImageCarousel, ImageCard, ImageModal, AssistantImages
// ============================================================

// Cache for image search results to prevent duplicate API calls
const OXIImageCache = {
    _cache: new Map(),
    _ttl: 30 * 60 * 1000, // 30 minutes

    get(key) {
        const entry = this._cache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > this._ttl) {
            this._cache.delete(key);
            return null;
        }
        return entry.data;
    },

    set(key, data) {
        this._cache.set(key, { data, timestamp: Date.now() });
    },

    has(key) {
        return this.get(key) !== null;
    }
};

// Visual topic detection keywords
const VISUAL_TOPICS = {
    outfits: ['outfit', 'fashion', 'style', 'wear', 'dress', 'clothing', 'look', 'attire', 'ensemble'],
    food: ['food', 'recipe', 'meal', 'dish', 'cuisine', 'delicious', 'eat', 'cooking', 'baking', 'breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'drink', 'cocktail', 'restaurant'],
    travel: ['travel', 'destination', 'vacation', 'holiday', 'trip', 'tourist', 'landmark', 'beach', 'mountain', 'city', 'country', 'wanderlust', 'adventure', 'journey'],
    cars: ['car', 'vehicle', 'automotive', 'supercar', 'luxury car', 'sports car', 'muscle car', 'truck', 'suv', 'motorcycle', 'bike'],
    animals: ['animal', 'pet', 'dog', 'cat', 'puppy', 'kitten', 'wildlife', 'bird', 'horse', 'nature', 'cute animal', 'zoo'],
    celebrities: ['celebrity', 'actor', 'actress', 'singer', 'famous', 'star', 'influencer', 'public figure', 'personality'],
    products: ['product', 'gadget', 'device', 'electronics', 'smartphone', 'laptop', 'headphone', 'speaker', 'watch', 'accessory', 'gear', 'tool', 'appliance'],
    rooms: ['room', 'interior', 'bedroom', 'living room', 'kitchen', 'bathroom', 'office', 'decor', 'furniture', 'design', 'home', 'apartment', 'space'],
    art: ['art', 'artwork', 'painting', 'drawing', 'illustration', 'sculpture', 'gallery', 'museum', 'digital art', 'abstract', 'creative', 'artist'],
    gaming: ['gaming', 'game', 'setup', 'console', 'playstation', 'xbox', 'nintendo', 'pc gaming', 'gamer', 'video game', 'gaming chair', 'streaming setup'],
    places: ['place', 'location', 'beautiful', 'scenic', 'landscape', 'view', 'architecture', 'building', 'park', 'garden', 'waterfall', 'sunset', 'amazing view'],
    people: ['people', 'person', 'man', 'woman', 'child', 'family', 'group', 'portrait', 'photography', 'lifestyle'],
    designs: ['design', 'graphic design', 'ui design', 'web design', 'branding', 'logo', 'poster', 'typography', 'minimalist', 'modern design', 'pattern']
};

// Topic detection function
function detectVisualTopics(text) {
    if (!text || typeof text !== 'string') return [];
    const lower = text.toLowerCase();
    const detected = [];

    for (const [topic, keywords] of Object.entries(VISUAL_TOPICS)) {
        const score = keywords.reduce((count, kw) => {
            return count + (lower.includes(kw) ? 1 : 0);
        }, 0);
        if (score > 0) {
            detected.push({ topic, score, keywords: keywords.filter(kw => lower.includes(kw)).slice(0, 3) });
        }
    }

    // Sort by relevance score, descending
    detected.sort((a, b) => b.score - a.score);
    return detected.slice(0, 3);
}

// Generate search queries from detected topics
function generateSearchQueries(responseText, detectedTopics) {
    const queries = [];

    // Try to extract specific names/places from the text
    const sentences = responseText.split(/[.!?\n]+/).filter(s => s.trim().length > 20);

    for (const topic of detectedTopics) {
        // Find sentences that contain topic keywords
        const relevantSentences = sentences.filter(s =>
            topic.keywords.some(kw => s.toLowerCase().includes(kw))
        );

        if (relevantSentences.length > 0) {
            // Use the most relevant sentence to craft a specific query
            const bestSentence = relevantSentences[0].trim().substring(0, 80);
            queries.push(bestSentence);
        } else {
            // Fall back to topic-based generic query
            queries.push(topic.topic + ' photography');
        }
    }

    // Limit to 2 unique queries max, remove duplicates
    return [...new Set(queries.map(q => q.toLowerCase()))].slice(0, 2);
}

// Check if a response is visually rich enough for images
function isVisualWorthy(text, detectedTopics) {
    if (!text || text.length < 40) return false;
    if (detectedTopics.length === 0) return false;

    // Don't show images for code-heavy responses
    const codeBlockCount = (text.match(/```/g) || []).length;
    if (codeBlockCount > 4) return false;

    // Don't show for very short or troubleshooting responses
    const questionWords = ['how to', 'how do', 'how can', 'troubleshoot', 'debug', 'fix', 'error', 'issue', 'problem'];
    const isTroubleshooting = questionWords.some(w => text.toLowerCase().includes(w));
    if (isTroubleshooting && detectedTopics.length === 1) return false;

    return true;
}

// Image search via server API with provider fallback
async function searchImages(query, count = 6) {
    const cacheKey = `img_${query}_${count}`;
    const cached = OXIImageCache.get(cacheKey);
    if (cached) return cached;

    try {
        const response = await fetch('/api/images/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, count })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const images = data.images || [];

        // Deduplicate by URL
        const seen = new Set();
        const unique = images.filter(img => {
            const key = img.url || img.id;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Cache results
        OXIImageCache.set(cacheKey, unique);

        return unique;
    } catch (err) {
        console.warn('[Image Search] Failed:', err.message);
        return [];
    }
}

// --- ImageCard Component ---
class ImageCard {
    constructor(image, options = {}) {
        this.image = image;
        this.aspectRatio = options.aspectRatio || '1:1';
        this.onClick = options.onClick || null;
        this.element = null;
    }

    render() {
        const card = document.createElement('div');
        card.className = 'oxy-image-card';
        card.style.aspectRatio = this.aspectRatio;

        // Skeleton loader
        const skeleton = document.createElement('div');
        skeleton.className = 'oxy-image-skeleton';
        skeleton.innerHTML = '<div class="skeleton-shimmer"></div>';
        card.appendChild(skeleton);

        // Actual image
        const img = document.createElement('img');
        img.className = 'oxy-image-card-img';
        img.src = this.image.url;
        img.alt = this.image.alt || this.image.description || 'Image';
        img.loading = 'lazy';

        // Credit badge
        const credit = document.createElement('div');
        credit.className = 'oxy-image-credit';
        credit.textContent = this.image.credit || '';

        // Provider badge
        const provider = document.createElement('div');
        provider.className = 'oxy-image-provider';
        const providerNames = { unsplash: 'Unsplash', pexels: 'Pexels', pixabay: 'Pixabay' };
        provider.textContent = providerNames[this.image.provider] || '';

        card.appendChild(img);
        if (this.image.credit) card.appendChild(credit);
        if (this.image.provider) card.appendChild(provider);

        // Lazy load handler
        img.addEventListener('load', () => {
            skeleton.style.display = 'none';
            card.classList.add('loaded');
        });

        img.addEventListener('error', () => {
            skeleton.style.display = 'none';
            card.classList.add('error');
            img.style.display = 'none';
            const errEl = document.createElement('div');
            errEl.className = 'oxy-image-error-placeholder';
            errEl.innerHTML = '<i class="fa-solid fa-image"></i>';
            card.appendChild(errEl);
        });

        // Click for fullscreen preview
        if (this.onClick) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                this.onClick(this.image);
            });
        }

        this.element = card;
        return card;
    }
}

// --- ImageCarousel Component ---
class ImageCarousel {
    constructor(images, options = {}) {
        this.images = images;
        this.aspectRatio = options.aspectRatio || '1:1';
        this.onImageClick = options.onImageClick || null;
        this.element = null;
        this.cards = [];
    }

    render() {
        const container = document.createElement('div');
        container.className = 'oxy-image-carousel';

        const track = document.createElement('div');
        track.className = 'oxy-carousel-track';

        this.cards = this.images.map((img) => {
            const card = new ImageCard(img, {
                aspectRatio: this.aspectRatio,
                onClick: this.onImageClick
            });
            const cardEl = card.render();
            track.appendChild(cardEl);
            return card;
        });

        container.appendChild(track);

        // Scroll indicators (dots at bottom)
        if (this.images.length > 1) {
            const dots = document.createElement('div');
            dots.className = 'oxy-carousel-dots';

            this.images.forEach((_, i) => {
                const dot = document.createElement('button');
                dot.className = `oxy-carousel-dot${i === 0 ? ' active' : ''}`;
                dot.setAttribute('aria-label', `Image ${i + 1}`);
                dot.addEventListener('click', () => {
                    const cardEl = track.children[i];
                    if (cardEl) {
                        cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                    }
                    dots.querySelectorAll('.oxy-carousel-dot').forEach(d => d.classList.remove('active'));
                    dot.classList.add('active');
                });
                dots.appendChild(dot);
            });

            container.appendChild(dots);

            // Update active dot on scroll
            let scrollTimeout;
            track.addEventListener('scroll', () => {
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => {
                    const scrollLeft = track.scrollLeft;
                    const cardWidth = track.children[0]?.offsetWidth || 1;
                    const gap = 12;
                    const activeIndex = Math.round(scrollLeft / (cardWidth + gap));
                    const clampedIndex = Math.min(activeIndex, this.images.length - 1);
                    dots.querySelectorAll('.oxy-carousel-dot').forEach(d => d.classList.remove('active'));
                    dots.children[clampedIndex]?.classList.add('active');
                }, 100);
            });
        }

        this.element = container;
        return container;
    }
}

// --- ImageModal (Fullscreen Preview) ---
class ImageModal {
    constructor() {
        this.element = null;
        this.currentImages = [];
        this.currentIndex = 0;
        this._createModal();
    }

    _createModal() {
        // Check if modal already exists
        let existing = document.getElementById('oxy-image-modal');
        if (existing) {
            this.element = existing;
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'oxy-image-modal';
        modal.id = 'oxy-image-modal';

        modal.innerHTML = `
            <button class="oxy-modal-close" aria-label="Close">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <button class="oxy-modal-prev" aria-label="Previous">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button class="oxy-modal-next" aria-label="Next">
                <i class="fa-solid fa-chevron-right"></i>
            </button>
            <div class="oxy-modal-image-wrap">
                <img class="oxy-modal-image" src="" alt="">
                <div class="oxy-modal-loader">
                    <div class="oxy-modal-spinner"></div>
                </div>
            </div>
            <div class="oxy-modal-info">
                <span class="oxy-modal-counter"></span>
                <a class="oxy-modal-download" target="_blank" rel="noopener noreferrer">
                    <i class="fa-solid fa-download"></i>
                </a>
            </div>
        `;

        document.body.appendChild(modal);
        this.element = modal;
        this._bindEvents();
    }

    _bindEvents() {
        const modal = this.element;

        modal.querySelector('.oxy-modal-close').addEventListener('click', () => this.close());
        modal.querySelector('.oxy-modal-prev').addEventListener('click', () => this.prev());
        modal.querySelector('.oxy-modal-next').addEventListener('click', () => this.next());

        // Click outside image to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.close();
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!modal.classList.contains('open')) return;
            if (e.key === 'Escape') this.close();
            if (e.key === 'ArrowLeft') this.prev();
            if (e.key === 'ArrowRight') this.next();
        });
    }

    open(images, startIndex = 0) {
        if (!images || images.length === 0) return;
        this.currentImages = images;
        this.currentIndex = startIndex;
        this._showImage();
        this.element.classList.add('open');
        document.body.style.overflow = 'hidden';

        // Show/hide navigation arrows
        const hasMultiple = images.length > 1;
        this.element.querySelector('.oxy-modal-prev').style.display = hasMultiple ? 'flex' : 'none';
        this.element.querySelector('.oxy-modal-next').style.display = hasMultiple ? 'flex' : 'none';
    }

    close() {
        this.element.classList.remove('open');
        document.body.style.overflow = '';
    }

    prev() {
        if (this.currentImages.length <= 1) return;
        this.currentIndex = (this.currentIndex - 1 + this.currentImages.length) % this.currentImages.length;
        this._showImage();
    }

    next() {
        if (this.currentImages.length <= 1) return;
        this.currentIndex = (this.currentIndex + 1) % this.currentImages.length;
        this._showImage();
    }

    _showImage() {
        const img = this.currentImages[this.currentIndex];
        if (!img) return;

        const modalImg = this.element.querySelector('.oxy-modal-image');
        const loader = this.element.querySelector('.oxy-modal-loader');
        const counter = this.element.querySelector('.oxy-modal-counter');
        const downloadLink = this.element.querySelector('.oxy-modal-download');

        // Show loader
        loader.style.display = 'flex';
        modalImg.style.opacity = '0';

        // Set image
        modalImg.src = img.url;
        modalImg.alt = img.alt || img.description || 'Image';

        // Update counter
        if (this.currentImages.length > 1) {
            counter.textContent = `${this.currentIndex + 1} / ${this.currentImages.length}`;
            counter.style.display = 'block';
        } else {
            counter.style.display = 'none';
        }

        // Update download link
        downloadLink.href = img.downloadUrl || img.url;

        // On load
        modalImg.onload = () => {
            loader.style.display = 'none';
            modalImg.style.opacity = '1';
        };

        modalImg.onerror = () => {
            loader.style.display = 'none';
            modalImg.style.opacity = '0.5';
        };
    }
}

// Singleton instance
let imageModalInstance = null;
function getImageModal() {
    if (!imageModalInstance) {
        imageModalInstance = new ImageModal();
    }
    return imageModalInstance;
}

// --- AssistantImages Component ---
// This is the main orchestrator: attaches images under assistant messages
class AssistantImages {
    constructor() {
        this.processedMessages = new WeakSet();
    }

    /**
     * Analyze a bot message and attach images if applicable.
     * @param {HTMLElement} msgDiv - The bot message DOM element
     * @param {string} text - The full response text
     * @param {Array} existingImages - Optional pre-fetched images
     */
    async processMessage(msgDiv, text, existingImages = null) {
        if (this.processedMessages.has(msgDiv)) return;
        if (!text || text.length < 20) return;

        // Detect visual topics
        const topics = detectVisualTopics(text);

        // Check if this response is visually worthy
        if (!isVisualWorthy(text, topics)) return;

        // Check for already attached images by data attribute
        if (msgDiv.dataset.imagesAttached === 'true') return;

        // Mark as processing
        this.processedMessages.add(msgDiv);
        msgDiv.dataset.imagesAttached = 'true';

        // Add loading state
        const loadingEl = this._addLoadingState(msgDiv);

        try {
            let allImages = [];

            if (existingImages && existingImages.length > 0) {
                allImages = existingImages;
            } else {
                // Generate search queries
                const queries = generateSearchQueries(text, topics);

                // Fetch images for each query
                const results = await Promise.allSettled(
                    queries.map(q => searchImages(q, 4))
                );

                for (const result of results) {
                    if (result.status === 'fulfilled' && result.value.length > 0) {
                        allImages.push(...result.value);
                    }
                }

                // Deduplicate by URL
                const seen = new Set();
                allImages = allImages.filter(img => {
                    const key = img.url;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });

                // Limit to 8 images max
                allImages = allImages.slice(0, 8);
            }

            // Remove loading state
            if (loadingEl && loadingEl.parentNode) {
                loadingEl.remove();
            }

            if (allImages.length === 0) return;

            // Create and render carousel
            this._renderImages(msgDiv, allImages);

        } catch (err) {
            console.warn('[AssistantImages] Error:', err);
            if (loadingEl && loadingEl.parentNode) {
                loadingEl.remove();
            }
        }
    }

    _addLoadingState(msgDiv) {
        // Check if images section already exists
        let imagesSection = msgDiv.querySelector('.oxy-assistant-images');
        if (!imagesSection) {
            imagesSection = document.createElement('div');
            imagesSection.className = 'oxy-assistant-images';
            msgDiv.querySelector('.message-content-wrapper')?.appendChild(imagesSection);
        }

        const loading = document.createElement('div');
        loading.className = 'oxy-image-loading-row';
        loading.innerHTML = Array(4).fill(0).map(() =>
            `<div class="oxy-image-loading-card"><div class="skeleton-shimmer"></div></div>`
        ).join('');

        imagesSection.appendChild(loading);
        return loading;
    }

    _renderImages(msgDiv, images) {
        let imagesSection = msgDiv.querySelector('.oxy-assistant-images');
        if (!imagesSection) {
            imagesSection = document.createElement('div');
            imagesSection.className = 'oxy-assistant-images';
            const contentWrapper = msgDiv.querySelector('.message-content-wrapper');
            if (contentWrapper) {
                contentWrapper.appendChild(imagesSection);
            }
        }

        // Clear loading state
        imagesSection.innerHTML = '';

        // Create label
        const label = document.createElement('div');
        label.className = 'oxy-images-label';
        label.innerHTML = '<i class="fa-solid fa-image"></i> Related images';
        imagesSection.appendChild(label);

        // Create carousel
        const modal = getImageModal();
        const carousel = new ImageCarousel(images, {
            aspectRatio: '1:1',
            onImageClick: (image) => {
                const idx = images.indexOf(image);
                modal.open(images, idx >= 0 ? idx : 0);
            }
        });

        imagesSection.appendChild(carousel.render());

        // Also add a 16:9 row for the first image if we have enough
        if (images.length >= 3) {
            const featuredImages = images.slice(0, 2);
            const featuredCarousel = new ImageCarousel(featuredImages, {
                aspectRatio: '16:9',
                onImageClick: (image) => {
                    const idx = images.indexOf(image);
                    modal.open(images, idx >= 0 ? idx : 0);
                }
            });
            const featuredRow = document.createElement('div');
            featuredRow.className = 'oxy-images-featured';
            featuredRow.appendChild(featuredCarousel.render());
            imagesSection.appendChild(featuredRow);
        }
    }
}

// Create global instance
window.OXIImageAssistant = new AssistantImages();
window.OXIImageCache = OXIImageCache;

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ImageCard, ImageCarousel, ImageModal, AssistantImages, detectVisualTopics, searchImages };
}